//! What every session is served from.

use std::collections::VecDeque;
use std::sync::Arc;

use bytes::Bytes;
use prost::Message;

use crate::proto::{Aircraft, Frame, Hello, Receiver, Reception, Snapshot};

/// tar1090's own history cadence.
const CADENCE_S: f64 = 8.0;
/// The scope keeps an hour of trail; a minute more fills its oldest slot.
const RETENTION_S: f64 = 3660.0;

/// One snapshot every eight seconds for the last hour, each aircraft reduced to
/// what a trail needs.
#[derive(Default)]
pub struct History {
    kept: VecDeque<Snapshot>,
    /// What sessions are handed, rebuilt only when `kept` changes.
    shared: Arc<[Snapshot]>,
}

impl History {
    /// Starts from what an upstream kept, as given but in time order and within the retention.
    pub fn seed(&mut self, mut kept: Vec<Snapshot>) {
        kept.sort_by(|a, b| a.now_s.total_cmp(&b.now_s));
        let oldest = kept
            .last()
            .map_or(f64::NEG_INFINITY, |last| last.now_s - RETENTION_S);
        let within = kept.into_iter().filter(|snapshot| snapshot.now_s >= oldest);
        self.kept = within.map(|snapshot| trail_of(&snapshot)).collect();
        self.shared = self.kept.iter().cloned().collect();
    }

    /// Keeps the snapshot when eight seconds have passed since the last one kept,
    /// and forgets those older than the retention.
    pub fn record(&mut self, snapshot: &Snapshot) {
        let last = self
            .kept
            .back()
            .map_or(f64::NEG_INFINITY, |kept| kept.now_s);
        if snapshot.now_s - last < CADENCE_S {
            return;
        }
        self.kept.push_back(trail_of(snapshot));
        let oldest = snapshot.now_s - RETENTION_S;
        while self.kept.front().is_some_and(|kept| kept.now_s < oldest) {
            self.kept.pop_front();
        }
        self.shared = self.kept.iter().cloned().collect();
    }

    #[must_use]
    pub fn shared(&self) -> Arc<[Snapshot]> {
        Arc::clone(&self.shared)
    }
}

fn trail_of(snapshot: &Snapshot) -> Snapshot {
    Snapshot {
        aircraft: snapshot.aircraft.iter().filter_map(trail).collect(),
        ..*snapshot
    }
}

/// What tar1090's history keeps of an aircraft; none without a position.
fn trail(aircraft: &Aircraft) -> Option<Aircraft> {
    aircraft.lat_deg.and(aircraft.lon_deg)?;
    Some(Aircraft {
        address: aircraft.address,
        identification: aircraft.identification.clone(),
        lat_deg: aircraft.lat_deg,
        lon_deg: aircraft.lon_deg,
        position_source: aircraft.position_source,
        air_ground_state: aircraft.air_ground_state,
        baro_altitude_ft: aircraft.baro_altitude_ft,
        ground_speed_kt: aircraft.ground_speed_kt,
        track_deg: aircraft.track_deg,
        reception: aircraft.reception.map(|reception| Reception {
            rssi_dbfs: None,
            ..reception
        }),
        ..Aircraft::default()
    })
}

/// The feed as it stands, cheap to clone into every session.
#[derive(Clone, Debug, PartialEq)]
pub struct Published {
    receiver: Receiver,
    history: Arc<[Snapshot]>,
    /// The latest snapshot as a frame after its length, encoded once for every session.
    latest: Bytes,
    latest_now_s: f64,
}

impl Published {
    #[must_use]
    pub fn new(receiver: Receiver, history: Arc<[Snapshot]>, latest: Snapshot) -> Self {
        Self {
            receiver,
            history,
            latest_now_s: latest.now_s,
            latest: Frame::from(latest).encode_length_delimited_to_vec().into(),
        }
    }

    /// The frame that opens a session resuming after `since`, after its length.
    /// Its history stops short of the latest snapshot, which follows it in full.
    #[must_use]
    pub fn hello(&self, since: f64) -> Bytes {
        let between =
            |snapshot: &&Snapshot| since < snapshot.now_s && snapshot.now_s < self.latest_now_s;
        let after = self.history.iter().filter(between);
        let hello = Hello {
            receiver: Some(self.receiver),
            history: after.cloned().collect(),
        };
        Frame::from(hello).encode_length_delimited_to_vec().into()
    }

    #[must_use]
    pub fn latest(&self) -> &Bytes {
        &self.latest
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use prost::Message;

    use super::{History, Published};
    use crate::proto::{
        Address, AirGroundState, Aircraft, Frame, Hello, Receiver, Reception, Registry, Snapshot,
        Source, frame::Body,
    };

    const RECEIVER: Receiver = Receiver {
        lat_deg: Some(33.5844),
        lon_deg: Some(130.4517),
    }; // RJFF

    fn at(now_s: f64) -> Snapshot {
        Snapshot {
            now_s,
            ..Snapshot::default()
        }
    }

    fn body(bytes: bytes::Bytes) -> Option<Body> {
        Frame::decode_length_delimited(bytes).ok()?.body
    }

    fn instants(snapshots: &[Snapshot]) -> Vec<f64> {
        snapshots.iter().map(|snapshot| snapshot.now_s).collect()
    }

    fn history_of(instants: impl IntoIterator<Item = f64>) -> Arc<[Snapshot]> {
        let mut history = History::default();
        for now_s in instants {
            history.record(&at(now_s));
        }
        history.shared()
    }

    #[test]
    fn hello_carries_the_receiver_and_the_history_after_since() {
        // Arrange
        let published = Published::new(RECEIVER, history_of([10.0, 18.0, 26.0]), at(27.0));

        // Act
        let hello = body(published.hello(18.0));

        // Assert
        let expected = Body::Hello(Hello {
            receiver: Some(RECEIVER),
            history: vec![at(26.0)],
        });
        assert_eq!(hello, Some(expected));
    }

    #[test]
    fn hello_leaves_the_latest_to_follow_in_full() {
        // Arrange
        let published = Published::new(RECEIVER, history_of([10.0, 18.0, 26.0]), at(26.0));

        // Act
        let hello = body(published.hello(f64::NEG_INFINITY));

        // Assert
        let expected = Body::Hello(Hello {
            receiver: Some(RECEIVER),
            history: vec![at(10.0), at(18.0)],
        });
        assert_eq!(hello, Some(expected));
    }

    #[test]
    fn latest_carries_the_snapshot() {
        // Arrange
        let published = Published::new(RECEIVER, history_of([]), at(10.0));

        // Act
        let latest = body(published.latest().clone());

        // Assert
        assert_eq!(latest, Some(Body::Snapshot(at(10.0))));
    }

    #[test]
    fn history_keeps_one_snapshot_every_eight_seconds() {
        // Arrange
        let seconds = (0..=20).map(f64::from);

        // Act
        let history = history_of(seconds);

        // Assert
        assert_eq!(instants(&history), [0.0, 8.0, 16.0]);
    }

    #[test]
    fn history_forgets_what_is_older_than_an_hour_and_a_minute() {
        // Arrange
        let seconds = [0.0, 8.0, 3000.0, 3668.0];

        // Act
        let history = history_of(seconds);

        // Assert
        assert_eq!(instants(&history), [8.0, 3000.0, 3668.0]);
    }

    #[test]
    fn history_keeps_only_what_a_trail_needs() {
        // Arrange
        let address = Some(Address::default());
        let positioned = Aircraft {
            address,
            identification: Some("TEST01".into()),
            lat_deg: Some(1.5),
            lon_deg: Some(-2.5),
            position_source: Source::Mlat.into(),
            air_ground_state: AirGroundState::OnGround.into(),
            baro_altitude_ft: Some(0),
            ground_speed_kt: Some(12.0),
            track_deg: Some(90.0),
            mach: Some(0.1),
            registry: Some(Registry::default()),
            reception: Some(Reception {
                messages: Some(12),
                rssi_dbfs: Some(-3.0),
                seen_s: Some(0.5),
                seen_pos_s: Some(0.5),
            }),
            ..Aircraft::default()
        };
        let positionless = Aircraft {
            address,
            ..Aircraft::default()
        };
        let snapshot = Snapshot {
            aircraft: vec![positioned.clone(), positionless],
            ..at(10.0)
        };
        let mut history = History::default();

        // Act
        history.record(&snapshot);

        // Assert
        let trail = Aircraft {
            mach: None,
            registry: None,
            reception: Some(Reception {
                rssi_dbfs: None,
                ..positioned.reception.unwrap_or_default()
            }),
            ..positioned
        };
        assert_eq!(history.shared()[0].aircraft, [trail]);
    }

    #[test]
    fn history_is_seeded_in_time_order_and_as_given() {
        // Arrange
        let seed = [3.0, 1.0, 2.0, 12.0].map(at);
        let mut history = History::default();

        // Act
        history.seed(seed.to_vec());

        // Assert
        assert_eq!(instants(&history.shared()), [1.0, 2.0, 3.0, 12.0]);
    }

    #[test]
    fn seeded_history_forgets_what_is_older_than_an_hour_and_a_minute() {
        // Arrange
        let seed = [0.0, 100.0, 3700.0].map(at);
        let mut history = History::default();

        // Act
        history.seed(seed.to_vec());

        // Assert
        assert_eq!(instants(&history.shared()), [100.0, 3700.0]);
    }
}
