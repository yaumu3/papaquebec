//! Feeds the scope with aircraft data over WebTransport.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use feeder::Failure;
use feeder::config::{Config, Origin};
use feeder::transport::Server;
use feeder::upstream::follow;
use feeder::upstream::sim::{Sim, sim_clock};
use feeder::upstream::tar1090::Tar1090;
use tokio::sync::watch;

/// readsb rewrites `aircraft.json` about once a second.
const ASK_EVERY: Duration = Duration::from_millis(250);
/// Half of the two weeks a browser accepts a certificate by hash for.
const RENEW_EVERY: Duration = Duration::from_hours(7 * 24);

#[tokio::main]
async fn main() -> Result<(), Failure> {
    let config = Config::read(|name| std::env::var(name).ok())?;
    let server = Server::bind(config.port, config.info)?;
    let (feed, listening) = watch::channel(None);
    eprintln!("feeding from {:?} on udp/{}", config.origin, server.port());

    match config.origin {
        Origin::Tar1090(base) => tokio::spawn(follow(Tar1090::new(&base), ASK_EVERY, feed)),
        Origin::Sim { site, speed, extra } => {
            let sim = Sim::new(site, sim_clock(speed, wall), extra);
            tokio::spawn(follow(sim, Duration::from_secs_f64(1.0 / speed), feed))
        }
    };
    tokio::spawn(renew(server.clone()));
    server.serve(listening).await;
    Ok(())
}

/// Seconds since the epoch.
fn wall() -> f64 {
    let since = SystemTime::now().duration_since(UNIX_EPOCH);
    since.map_or(0.0, |since| since.as_secs_f64())
}

async fn renew(server: Server) {
    let mut tick = tokio::time::interval(RENEW_EVERY);
    tick.tick().await;
    loop {
        tick.tick().await;
        if let Err(error) = server.renew() {
            eprintln!("certificate not renewed: {error}");
        }
    }
}
