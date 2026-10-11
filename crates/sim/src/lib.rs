//! Stands in for a receiver: synthesized traffic, sent as a receiver would send it.

mod fleet;
mod scenario;

use std::time::Duration;

pub use fleet::{Fleet, MOST_EXTRA, State};
pub use scenario::{Runway, Scenario};
use tokio::io::AsyncWriteExt;
use tokio::net::{TcpListener, TcpStream};
use tokio::time::MissedTickBehavior;

/// Flies the fleet every `every`, and sends what it broadcasts to everyone
/// connected, as a receiver passes on what it hears.
pub async fn serve(listener: TcpListener, mut fleet: Fleet, every: Duration) {
    let mut connected: Vec<TcpStream> = Vec::new();
    let mut tick = tokio::time::interval(every);
    tick.set_missed_tick_behavior(MissedTickBehavior::Delay);
    loop {
        tokio::select! {
            accepted = listener.accept() => connected.extend(accepted.map(|(stream, _)| stream)),
            _ = tick.tick() => {
                let frames = fleet.fly();
                let mut kept = Vec::with_capacity(connected.len());
                for mut stream in connected {
                    if stream.write_all(&frames).await.is_ok() {
                        kept.push(stream);
                    }
                }
                connected = kept;
            }
        }
    }
}

/// A clock in sim seconds that runs `speed` times faster than `wall`, which is in seconds.
pub fn clock(speed: f64, wall: impl Fn() -> f64 + Clone) -> impl Fn() -> f64 + Clone {
    let start = wall();
    move || start + (wall() - start) * speed
}

#[cfg(test)]
mod testing {
    use std::sync::{Arc, Mutex};

    use tracker::position::Position;

    /// RJFF
    pub(crate) const SITE: Position = Position {
        lat_deg: 33.5844,
        lon_deg: 130.4517,
    };

    /// A clock at `start` seconds that only its hand moves on: the clock, and
    /// the hand, which moves it on by the seconds.
    pub(crate) fn hand_clock(
        start: f64,
    ) -> (impl Fn() -> f64 + Clone + Send + 'static, impl Fn(f64)) {
        let now = Arc::new(Mutex::new(start));
        let hand = Arc::clone(&now);
        (
            move || *now.lock().expect("clock"),
            move |seconds| {
                *hand.lock().expect("clock") += seconds;
            },
        )
    }
}

#[cfg(test)]
mod tests {
    use super::clock;
    use crate::testing::hand_clock;

    #[test]
    fn clock_runs_at_a_multiple_of_wall_time() {
        // Arrange
        let (wall, hand) = hand_clock(1000.0);
        let clock = clock(10.0, wall);
        hand(3.0);

        // Act
        let now = clock();

        // Assert
        assert!((now - 1030.0).abs() < 1e-9, "{now} is not 1030");
    }
}
