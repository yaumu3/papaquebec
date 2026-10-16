//! What every session is served from.

use std::collections::VecDeque;
use std::sync::Arc;

use bytes::Bytes;
use prost::Message;

use tracker::proto::{Frame, Hello, Qnh, Receiver, Snapshot, Weather, ms};

/// How far apart the snapshots of the history are kept.
const CADENCE_MS: u64 = 8000;
/// The scope keeps an hour of trail and readings; a minute more fills its oldest slot.
const RETENTION_MS: u64 = 3_660_000;

/// One snapshot every eight seconds for the last hour, each aircraft whole, so a
/// session that joins gets the hour of trail and readings the scope shows.
#[derive(Default)]
pub(crate) struct History {
    kept: VecDeque<Arc<Snapshot>>,
    /// What sessions are handed, rebuilt only when `kept` changes; the
    /// snapshots themselves are shared, not copied.
    shared: Arc<[Arc<Snapshot>]>,
}

impl History {
    /// Keeps the snapshot when eight seconds have passed since the last one kept,
    /// and forgets those older than the retention.
    pub(crate) fn record(&mut self, snapshot: &Snapshot) {
        let last = self.kept.back().map(|kept| kept.now_ms);
        if last.is_some_and(|last| snapshot.now_ms < last + CADENCE_MS) {
            return;
        }
        self.kept.push_back(Arc::new(snapshot.clone()));
        let oldest = snapshot.now_ms.saturating_sub(RETENTION_MS);
        while self.kept.front().is_some_and(|kept| kept.now_ms < oldest) {
            self.kept.pop_front();
        }
        self.shared = self.kept.iter().cloned().collect();
    }

    #[must_use]
    pub(crate) fn shared(&self) -> Arc<[Arc<Snapshot>]> {
        Arc::clone(&self.shared)
    }
}

/// The feed as it stands, cheap to clone into every session.
#[derive(Clone, Debug, PartialEq)]
pub struct Published {
    receiver: Receiver,
    history: Arc<[Arc<Snapshot>]>,
    /// The latest snapshot as a frame after its length, encoded once for every session.
    latest: Bytes,
    latest_now_ms: u64,
}

impl Published {
    #[must_use]
    pub fn new(receiver: Receiver, history: Arc<[Arc<Snapshot>]>, latest: Snapshot) -> Self {
        Self {
            receiver,
            history,
            latest_now_ms: latest.now_ms,
            latest: framed(latest),
        }
    }

    /// The frame that opens a session resuming after `since_s`, in seconds
    /// since the epoch, after its length. Its history stops short of the
    /// latest snapshot, which follows it in full.
    #[must_use]
    pub fn hello(&self, since_s: f64) -> Bytes {
        let since = ms(since_s);
        let between = |snapshot: &&Arc<Snapshot>| {
            since < snapshot.now_ms && snapshot.now_ms < self.latest_now_ms
        };
        let after = self.history.iter().filter(between);
        let hello = Hello {
            receiver: Some(self.receiver),
            history: after.map(|snapshot| Snapshot::clone(snapshot)).collect(),
        };
        framed(hello)
    }

    #[must_use]
    pub fn latest(&self) -> &Bytes {
        &self.latest
    }
}

/// The stations' current reports as a frame after its length, for every session.
#[must_use]
pub fn weather(qnh: Vec<Qnh>) -> Bytes {
    framed(Weather { qnh })
}

/// The frame after its length, as a session's stream carries it.
fn framed(frame: impl Into<Frame>) -> Bytes {
    frame.into().encode_length_delimited_to_vec().into()
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use prost::Message;

    use super::{History, Published, weather};
    use tracker::proto::{
        Address, Aircraft, Flag, Frame, Hello, Identification, Int, Position, Qnh, Real, Receiver,
        Reception, Registry, Snapshot, Source, Weather, frame::Body,
    };

    const RECEIVER: Receiver = Receiver {
        lat_deg: Some(33.5844),
        lon_deg: Some(130.4517),
    }; // RJFF

    fn at(now_ms: u64) -> Snapshot {
        Snapshot {
            now_ms,
            ..Snapshot::default()
        }
    }

    fn body(bytes: bytes::Bytes) -> Option<Body> {
        Frame::decode_length_delimited(bytes).ok()?.body
    }

    fn instants(snapshots: &[Arc<Snapshot>]) -> Vec<u64> {
        snapshots.iter().map(|snapshot| snapshot.now_ms).collect()
    }

    fn history_of(instants: impl IntoIterator<Item = u64>) -> Arc<[Arc<Snapshot>]> {
        let mut history = History::default();
        for now_ms in instants {
            history.record(&at(now_ms));
        }
        history.shared()
    }

    #[test]
    fn hello_carries_the_receiver_and_the_history_after_since() {
        // Arrange
        let history = history_of([10_000, 18_000, 26_000]);
        let published = Published::new(RECEIVER, history, at(27_000));

        // Act
        let hello = body(published.hello(18.0));

        // Assert
        let expected = Body::Hello(Hello {
            receiver: Some(RECEIVER),
            history: vec![at(26_000)],
        });
        assert_eq!(hello, Some(expected));
    }

    #[test]
    fn hello_leaves_the_latest_to_follow_in_full() {
        // Arrange
        let history = history_of([10_000, 18_000, 26_000]);
        let published = Published::new(RECEIVER, history, at(26_000));

        // Act
        let hello = body(published.hello(f64::NEG_INFINITY));

        // Assert
        let expected = Body::Hello(Hello {
            receiver: Some(RECEIVER),
            history: vec![at(10_000), at(18_000)],
        });
        assert_eq!(hello, Some(expected));
    }

    #[test]
    fn latest_carries_the_snapshot() {
        // Arrange
        let published = Published::new(RECEIVER, history_of([]), at(10_000));

        // Act
        let latest = body(published.latest().clone());

        // Assert
        assert_eq!(latest, Some(Body::Snapshot(at(10_000))));
    }

    #[test]
    fn history_keeps_one_snapshot_every_eight_seconds() {
        // Arrange
        let seconds = (0..=20).map(|second| second * 1000);

        // Act
        let history = history_of(seconds);

        // Assert
        assert_eq!(instants(&history), [0, 8000, 16_000]);
    }

    #[test]
    fn history_forgets_what_is_older_than_an_hour_and_a_minute() {
        // Arrange
        let seconds = [0, 8000, 3_000_000, 3_668_000];

        // Act
        let history = history_of(seconds);

        // Assert
        assert_eq!(instants(&history), [8000, 3_000_000, 3_668_000]);
    }

    #[test]
    fn history_keeps_every_aircraft_whole() {
        // Arrange
        let address = Some(Address::default());
        let positioned = Aircraft {
            address,
            reception: Some(Reception {
                messages: 12,
                rssi_dbfs: Some(-3.0),
                heard_ms: 9500,
            }),
            identification: Some(Identification {
                callsign: Some("TEST01".into()),
                emitter_category: None,
                heard_ms: 9000,
            }),
            position: Some(Position {
                lat_deg: 1.5,
                lon_deg: -2.5,
                source: Source::Mlat.into(),
                nic: 8,
                rc_m: Some(186),
                heard_ms: 9500,
            }),
            on_ground: Some(Flag {
                value: true,
                heard_ms: 9500,
            }),
            ground_speed_kt: Some(Real {
                value: 12.0,
                heard_ms: 9500,
            }),
            selected_altitude_mcp_ft: Some(Int {
                value: 4000,
                heard_ms: 9000,
            }),
            registry: Some(Registry::default()),
            ..Aircraft::default()
        };
        let positionless = Aircraft {
            address,
            baro_altitude_ft: Some(Int {
                value: 35_000,
                heard_ms: 9500,
            }),
            ..Aircraft::default()
        };
        let snapshot = Snapshot {
            aircraft: vec![positioned.clone(), positionless.clone()],
            ..at(10_000)
        };
        let mut history = History::default();

        // Act
        history.record(&snapshot);

        // Assert
        assert_eq!(history.shared()[0].aircraft, [positioned, positionless]);
    }

    #[test]
    fn weather_frame_carries_the_stations_reports() {
        // Arrange
        let qnh = vec![Qnh {
            station: "RJTT".to_owned(),
            lat_deg: 35.553,
            lon_deg: 139.781,
            observed_ms: 1_790_074_800_000,
            qnh_in_hg: 29.94,
        }];

        // Act
        let frame = weather(qnh.clone());

        // Assert
        assert_eq!(body(frame), Some(Body::Weather(Weather { qnh })));
    }
}
