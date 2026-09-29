//! Serves the scope and its feed.

use std::net::Ipv6Addr;
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use authority::{Authority, How};
use feeder::Failure;
use feeder::transport::Server;
use feeder::upstream::follow;
use feeder::upstream::sim::{Sim, sim_clock};
use feeder::upstream::tar1090::Tar1090;
use tokio::net::TcpListener;
use tokio::sync::watch;
use web::config::{Config, Door, Origin};
use web::door::{self, Certificates};
use web::site::{Site, router};

/// readsb rewrites `aircraft.json` about once a second.
const ASK_EVERY: Duration = Duration::from_millis(250);
/// Half of the two weeks a browser accepts a certificate by hash for.
const RENEW_EVERY: Duration = Duration::from_hours(7 * 24);

#[tokio::main]
async fn main() -> Result<(), Failure> {
    let config = Config::read(|name| std::env::var(name).ok())?;
    let server = Server::bind(config.port)?;
    let (feed, listening) = watch::channel(None);
    eprintln!("feeding from {:?} on udp/{}", config.origin, server.port());

    let (port, certificates) = match config.door {
        Door::Secure { port, only } => {
            let data = config
                .data
                .ok_or("no XDG_DATA_HOME or HOME to keep the authority in")?;
            (
                port,
                Some(Arc::new(Certificates::new(authority(&data)?, only))),
            )
        }
        Door::Plain { port } => (port, None),
    };
    let reached = server.clone();
    let site = Site {
        dist: "dist".into(),
        map: "public/map".into(),
        tar1090: match &config.origin {
            Origin::Tar1090(base) => Some(base.clone()),
            Origin::Sim { .. } => None,
        },
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

    match config.origin {
        Origin::Tar1090(base) => tokio::spawn(follow(Tar1090::new(&base), ASK_EVERY, feed)),
        Origin::Sim { site, speed, extra } => {
            let sim = Sim::new(site, sim_clock(speed, wall), extra);
            tokio::spawn(follow(sim, Duration::from_secs_f64(1.0 / speed), feed))
        }
    };
    tokio::spawn(server.clone().keep_renewed(RENEW_EVERY));
    server.serve(listening).await;
    Ok(())
}

/// The authority kept in the data directory, or Caddy's there, or a new one.
fn authority(data: &Path) -> Result<Authority, Failure> {
    let own = data.join("papaquebec/authority");
    let opened = Authority::open(&own, &data.join("caddy/pki/authorities/local"))?;
    match &opened.how {
        How::Kept => eprintln!("authority: kept in {}", own.display()),
        How::Adopted => eprintln!("authority: adopted Caddy's, so devices keep trusting it"),
        How::Created { refused: None } => {
            eprintln!("authority: created; devices must trust /root.crt once");
        }
        How::Created { refused: Some(why) } => {
            eprintln!("authority: created, as Caddy's could not be used ({why})");
        }
    }
    Ok(opened.authority)
}

/// Seconds since the epoch.
fn wall() -> f64 {
    let since = SystemTime::now().duration_since(UNIX_EPOCH);
    since.map_or(0.0, |since| since.as_secs_f64())
}
