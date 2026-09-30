//! Serves the scope and its feed.

use std::net::{Ipv4Addr, Ipv6Addr};
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use authority::{Authority, How};
use feeder::Failure;
use feeder::follow::follow;
use feeder::registry::Registry;
use feeder::transport::Server;
use sim::Fleet;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::watch;
use web::config::{Config, Door, Origin};
use web::door::{self, Certificates};
use web::site::{Site, router};

/// How often the scope is told what the receiver hears.
const PUBLISH_EVERY: Duration = Duration::from_secs(1);
/// Half of the two weeks a browser accepts a certificate by hash for.
const RENEW_EVERY: Duration = Duration::from_hours(7 * 24);
const RENEW_RETRY: Duration = Duration::from_mins(1);

#[tokio::main]
async fn main() -> Result<(), Failure> {
    let config = Config::read(|name| std::env::var(name).ok())?;
    let server = Server::bind(config.port)?;
    let (feed, listening) = watch::channel(None);
    let origin = match &config.origin {
        Origin::Beast { address, .. } => address,
        Origin::Sim { .. } => "the sim",
    };
    eprintln!("feeding from {origin} on udp/{}", server.port());

    let (port, certificates) = match config.door {
        Door::Secure { port, only } => {
            let data = config
                .data
                .as_deref()
                .ok_or("no XDG_DATA_HOME or HOME to keep the authority in")?;
            (
                port,
                Some(Arc::new(Certificates::new(authority(data)?, only))),
            )
        }
        Door::Plain { port } => (port, None),
    };
    let reached = server.clone();
    let site = Site {
        dist: "dist".into(),
        map: "public/map".into(),
        feed: Arc::new(move || reached.info()),
        authority: certificates
            .as_ref()
            .map(|certificates| certificates.authority_pem()),
    };
    let listener = TcpListener::bind((Ipv6Addr::UNSPECIFIED, port)).await?;
    let secure = if certificates.is_some() {
        "https"
    } else {
        "http"
    };
    eprintln!("serving the scope over {secure} on tcp/{port}");
    tokio::spawn(door::serve(listener, certificates, router(&site)));

    let (registered, registry) = watch::channel(Arc::new(Registry::default()));
    match config.origin {
        Origin::Beast { address, site } => {
            let connect = move || TcpStream::connect(address.clone());
            tokio::spawn(follow(connect, site, wall, PUBLISH_EVERY, registry, feed));
        }
        Origin::Sim { site, speed, extra } => {
            // The sim stands in for the receiver, on a port of its own.
            let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
            let address = listener.local_addr()?;
            let every = PUBLISH_EVERY.div_f64(speed);
            let fleet = Fleet::new(site, sim::clock(speed, wall), extra);
            registered.send_replace(Arc::new(fleet.registered().collect()));
            tokio::spawn(sim::serve(listener, fleet, every));
            let (connect, clock) = (move || TcpStream::connect(address), sim::clock(speed, wall));
            tokio::spawn(follow(connect, site, clock, every, registry, feed));
        }
    }
    tokio::spawn(server.clone().keep_renewed(RENEW_EVERY, RENEW_RETRY));
    server.serve(listening).await;
    Ok(())
}

/// The authority kept in the data directory, or a new one kept there.
fn authority(data: &Path) -> Result<Authority, Failure> {
    let kept = data.join("papaquebec/authority");
    let opened = Authority::open(&kept)?;
    match opened.how {
        How::Kept => eprintln!("authority: kept in {}", kept.display()),
        How::Created => eprintln!("authority: created; devices must trust /root.crt once"),
    }
    Ok(opened.authority)
}

/// Seconds since the epoch.
fn wall() -> f64 {
    let since = SystemTime::now().duration_since(UNIX_EPOCH);
    since.map_or(0.0, |since| since.as_secs_f64())
}
