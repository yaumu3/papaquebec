//! The sim, heard as a receiver is: what it flies is what the tracker makes of it.

use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use feeder::follow::{follow, wall};
use prost::Message;
use sim::{Fleet, Scenario};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::watch;
use tracker::beast::Reader;
use tracker::position::Position;
use tracker::proto::{
    Aircraft, EmergencyPriorityStatus, Frame, Snapshot, Source,
    advisory::{Threat, ThreatPosition},
    frame::Body,
    reported,
};
use tracker::registry::Registry;
use tracker::traffic::Traffic;

/// RJFF
const SITE: Position = Position {
    lat_deg: 33.5844,
    lon_deg: 130.4517,
};

/// The sim from second 1000 on, and the traffic heard of it.
struct Heard {
    fleet: Fleet,
    now: Arc<Mutex<f64>>,
    reader: Reader,
    traffic: Traffic,
    registry: Registry,
}

impl Heard {
    fn new(extra: u32) -> Self {
        Self::of(|clock| Fleet::new(SITE, clock, extra))
    }

    /// The fleet `make` flies by a clock from second 1000 on.
    fn of(make: impl FnOnce(Box<dyn Fn() -> f64 + Send>) -> Fleet) -> Self {
        let now = Arc::new(Mutex::new(1000.0));
        let clock = Arc::clone(&now);
        let fleet = make(Box::new(move || *clock.lock().expect("clock")));
        Self {
            registry: fleet.registered().collect(),
            fleet,
            now,
            reader: Reader::default(),
            traffic: Traffic::new(SITE),
        }
    }

    /// What is known after the seconds, the fleet's messages at their end heard.
    fn after(&mut self, seconds: f64) -> Snapshot {
        *self.now.lock().expect("clock") += seconds;
        let now_s = *self.now.lock().expect("clock");
        self.traffic
            .hear(&self.reader.read(&self.fleet.fly()), now_s);
        let mut snapshot = self.traffic.snapshot(now_s);
        self.registry.fill(&mut snapshot);
        snapshot
    }

    /// What is known once a message of each position format was heard.
    fn placed(&mut self) -> Snapshot {
        self.after(0.0);
        self.after(1.0)
    }
}

/// The aircraft of the fleet with the number, which its address ends in.
fn numbered(snapshot: &Snapshot, number: u32) -> &Aircraft {
    let is = |a: &&Aircraft| {
        a.address
            .is_some_and(|address| address.value == 0x00d0_0000 + number)
    };
    snapshot.aircraft.iter().find(is).expect("in the fleet")
}

fn on_ground(aircraft: &Aircraft) -> bool {
    aircraft.on_ground.is_some_and(|flag| flag.value)
}

fn intent(aircraft: &Aircraft) -> [Option<i32>; 3] {
    [
        reported(aircraft.baro_altitude_ft),
        reported(aircraft.selected_altitude_mcp_ft),
        reported(aircraft.baro_vertical_rate_fpm),
    ]
}

#[test]
fn every_aircraft_is_heard_and_placed_near_the_site() {
    // Arrange
    let mut heard = Heard::new(0);

    // Act
    let snapshot = heard.placed();

    // Assert: each heard, and placed, at the snapshot's instant
    let near = |a: &Aircraft| {
        a.place()
            .is_some_and(|place| SITE.distance_nm(place) < 60.0)
    };
    let timed = |a: &Aircraft| {
        a.reception.is_some_and(|r| r.heard_ms == snapshot.now_ms)
            && a.position.is_some_and(|p| p.heard_ms == snapshot.now_ms)
    };
    assert_eq!(snapshot.aircraft.len(), 13);
    assert!(snapshot.aircraft.iter().all(near));
    assert!(snapshot.aircraft.iter().all(timed));
}

#[test]
fn every_aircraft_moves_along_its_track() {
    // Arrange
    let mut heard = Heard::new(0);
    let first = heard.placed();

    // Act
    let second = heard.after(10.0);

    // Assert
    let moved = second
        .aircraft
        .iter()
        .zip(&first.aircraft)
        .filter(|(now, before)| now.address == before.address && now.place() != before.place());
    assert_eq!(moved.count(), first.aircraft.len());
    let airliner = numbered(&second, 1);
    let flown = numbered(&first, 1)
        .place()
        .zip(airliner.place())
        .map(|(from, to)| from.distance_nm(to));
    // 290 kt for 10 s
    assert!(
        flown.is_some_and(|flown| (flown - 0.806).abs() < 0.01),
        "{flown:?}"
    );
}

#[test]
fn fleet_exercises_every_glyph_and_color() {
    // Arrange
    let mut heard = Heard::new(0);

    // Act
    let snapshot = heard.placed();

    // Assert
    let count = |is: &dyn Fn(&Aircraft) -> bool| snapshot.aircraft.iter().filter(|a| is(a)).count();
    let multilaterated = |a: &Aircraft| a.position.is_some_and(|p| p.source() == Source::Mlat);
    assert_eq!(count(&multilaterated), 1);
    assert_eq!(count(&|a| a.callsign().is_none()), 2);
    assert_eq!(count(&|a| a.selected_altitude_mcp_ft.is_some()), 5);
    let qualified =
        |a: &Aircraft| a.position.is_some_and(|p| p.nic == 8) && reported(a.nac_p) == Some(9);
    assert_eq!(count(&qualified), 13);
}

#[test]
fn emergency_is_on_a_target_without_a_callsign() {
    // Arrange
    let mut heard = Heard::new(0);

    // Act
    let snapshot = heard.placed();

    // Assert
    let emergencies: Vec<_> = snapshot
        .aircraft
        .iter()
        .filter(|a| reported(a.mode_a_code) == Some(0o7700))
        .collect();
    assert_eq!(emergencies.len(), 1);
    assert_eq!(emergencies[0].callsign(), None);
    assert_eq!(
        emergencies[0].emergency.map(|e| e.status()),
        Some(EmergencyPriorityStatus::GeneralEmergency)
    );
}

#[test]
fn a_status_of_its_own_is_broadcast_with_an_ordinary_squawk() {
    // Arrange
    let mut heard = Heard::new(0);

    // Act
    let snapshot = heard.placed();

    // Assert
    assert_eq!(
        [12, 13].map(|number| {
            let aircraft = numbered(&snapshot, number);
            let status = aircraft.emergency.map(|e| e.status());
            (reported(aircraft.mode_a_code), status)
        }),
        [
            (Some(0o2253), Some(EmergencyPriorityStatus::MinimumFuel)),
            (
                Some(0o3305),
                Some(EmergencyPriorityStatus::GeneralEmergency)
            ),
        ]
    );
}

#[test]
fn taxiing_targets_are_on_the_ground_at_taxi_speed() {
    // Arrange
    let mut heard = Heard::new(0);

    // Act
    let snapshot = heard.placed();

    // Assert
    let ground: Vec<_> = snapshot.aircraft.iter().filter(|a| on_ground(a)).collect();
    let taxiing = |a: &&Aircraft| {
        a.ground_speed_kt
            .is_some_and(|gs| gs.value > 0.0 && gs.value < 40.0)
    };
    assert_eq!(ground.len(), 2);
    assert!(ground.iter().all(taxiing));
    assert!(ground.iter().all(|a| a.baro_altitude_ft.is_none()));
}

#[test]
fn air_data_are_heard_of_every_aircraft_in_the_air() {
    // Arrange
    let mut heard = Heard::new(0);
    heard.placed();

    // Act: through another second of replies
    let snapshot = heard.after(1.0);

    // Assert: the speeds through the air, the wind the sim blows, and the
    // standard temperature at the level to what the steps of the Mach
    // number and the airspeed allow
    let airborne: Vec<_> = snapshot.aircraft.iter().filter(|a| !on_ground(a)).collect();
    assert_eq!(airborne.len(), 11);
    let speeds = |a: &&Aircraft| {
        a.true_airspeed_kt.is_some() && a.indicated_airspeed_kt.is_some() && a.mach.is_some()
    };
    assert!(airborne.iter().all(speeds), "{airborne:?}");
    let wind = |a: &&Aircraft| {
        let wind = a.wind_dir_deg.zip(a.wind_speed_kt);
        wind.is_some_and(|(from, speed)| {
            (from.value - 270.0).abs() < 4.0 && (speed.value - 35.0).abs() < 3.0
        })
    };
    assert!(airborne.iter().all(wind), "{airborne:?}");
    let standard = |a: &&Aircraft| {
        let isa = reported(a.baro_altitude_ft).map(|ft| 15.0 - 1.9812 * f64::from(ft) / 1000.0);
        let steps = a
            .mach
            .zip(a.true_airspeed_kt)
            .map(|(mach, tas)| 2.0 * 288.0 * (0.004 / mach.value + 1.0 / tas.value));
        let oat = a.oat_c.map(|oat| oat.value);
        oat.zip(isa)
            .zip(steps)
            .is_some_and(|((oat, isa), within)| (oat - isa).abs() < within)
    };
    assert!(airborne.iter().all(standard), "{airborne:?}");
}

#[test]
fn one_aircraft_idents_and_one_flies_an_advisory() {
    // Arrange
    let mut heard = Heard::new(0);

    // Act
    let snapshot = heard.placed();

    // Assert: a climb, of one threat
    let identing: Vec<_> = snapshot
        .aircraft
        .iter()
        .filter(|a| a.ident.is_some_and(|ident| ident.value))
        .collect();
    assert_eq!(identing.len(), 1);
    assert_eq!(identing[0].callsign(), Some("TEST02"));
    let advised: Vec<_> = snapshot
        .aircraft
        .iter()
        .filter(|a| a.advisory.is_some())
        .collect();
    assert_eq!(advised.len(), 1);
    assert_eq!(advised[0].callsign(), Some("TEST07"));
    let advisory = advised[0].advisory.as_ref().expect("advised");
    let resolution = advisory.resolution.expect("of one threat");
    assert!(resolution.corrective && resolution.positive && !resolution.downward);
    let placed = ThreatPosition {
        altitude_ft: Some(16_500),
        range_nm: Some(2.5),
        bearing_deg: Some(33.0),
    };
    assert_eq!(advisory.threat, Some(Threat::ThreatPosition(placed)));
}

#[test]
fn newly_set_level_is_started_toward_after_a_pause() {
    // Arrange
    let mut heard = Heard::new(0);
    heard.after(0.0);

    // Act
    let snapshot = heard.after(30.0);

    // Assert: 21000 ft selected, in the steps it is broadcast in, and 1000
    // fpm in the steps the heading and speed report answers it in, which
    // comes after the broadcast
    assert_eq!(
        intent(numbered(&snapshot, 7)),
        [Some(17_000), Some(20_992), Some(992)]
    );
}

#[test]
fn level_it_came_from_is_set_once_the_selected_one_was_held() {
    // Arrange
    let mut heard = Heard::new(0);
    heard.after(0.0);
    heard.after(200.0);

    // Act
    let snapshot = heard.after(100.0);

    // Assert: 5000 ft selected, in the steps it is broadcast in
    assert_eq!(
        intent(numbered(&snapshot, 3)),
        [Some(7000), Some(4992), Some(0)]
    );
}

#[test]
fn turning_arrivals_carry_their_roll_and_track_rate() {
    // Arrange: arrivals merging onto one final
    let mut heard = Heard::of(|clock| Fleet::scenario(SITE, clock, Scenario::Merge, 1, 0));
    heard.after(0.0);

    // Act: two minutes of them, each as it was heard while it turned
    let turning: Vec<_> = (0..120)
        .flat_map(|_| {
            let snapshot = heard.after(1.0);
            let turning: Vec<_> = snapshot
                .aircraft
                .iter()
                .filter_map(|a| {
                    let rate = a.track_rate_deg_per_s?.value;
                    (rate.abs() > 0.5).then(|| (rate, a.roll_deg.map(|roll| roll.value)))
                })
                .collect();
            turning
        })
        .collect();

    // Assert: whoever turns rolls the same way, within what an airliner banks
    assert!(!turning.is_empty());
    let banked = |(rate, roll): &(f64, Option<f64>)| {
        roll.is_some_and(|roll| roll.signum() == rate.signum() && roll.abs() <= 35.0)
    };
    assert!(turning.iter().all(banked), "{turning:?}");
}

#[test]
fn extra_traffic_is_added_within_the_bounds() {
    // Arrange: an aircraft that crosses a change of longitude zones between
    // its first two positions is placed by the third
    let mut heard = Heard::new(500);
    heard.placed();

    // Act
    let snapshot = heard.after(1.0);

    // Assert
    let addresses: HashSet<_> = snapshot
        .aircraft
        .iter()
        .filter_map(|a| a.address.map(|address| address.value))
        .collect();
    let near = |a: &Aircraft| {
        a.place()
            .is_some_and(|place| SITE.distance_nm(place) < 60.0)
    };
    assert_eq!(snapshot.aircraft.len(), 13 + 500);
    assert_eq!(addresses.len(), 13 + 500);
    assert!(snapshot.aircraft.iter().all(near));
}

#[test]
fn every_identity_is_fictional_and_registered() {
    // Arrange
    let mut heard = Heard::new(50);

    // Act
    let snapshot = heard.placed();

    // Assert
    let callsigns: Vec<_> = snapshot
        .aircraft
        .iter()
        .filter_map(Aircraft::callsign)
        .collect();
    let registered = |a: &Aircraft| {
        let registry = a.registry.as_ref();
        let registration = registry.and_then(|r| r.registration.as_deref());
        let designator = registry.and_then(|r| r.type_designator.as_deref());
        registration.is_some_and(|r| r.starts_with("TEST-")) && designator.is_some()
    };
    assert_eq!(callsigns.len(), 11 + 50);
    assert!(
        callsigns
            .iter()
            .all(|callsign| callsign.starts_with("TEST"))
    );
    assert!(snapshot.aircraft.iter().all(registered));
}

#[tokio::test]
async fn fleet_served_to_a_connection_is_followed_into_the_feed() {
    // Arrange: a sim twenty times faster than the clock, flown every sim second
    const EVERY: Duration = Duration::from_millis(50);
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("binds");
    let address = listener.local_addr().expect("bound");
    let clock = sim::clock(20.0, wall);
    let fleet = Fleet::new(SITE, clock.clone(), 0);
    let (_kept, registry) = watch::channel(Arc::new(fleet.registered().collect::<Registry>()));
    let (sender, mut feed) = watch::channel(None);
    tokio::spawn(sim::serve(listener, fleet, EVERY));
    let connect = move || TcpStream::connect(address);
    tokio::spawn(follow(connect, SITE, clock, EVERY, registry, sender));

    // Act: until every aircraft is placed
    let placed = tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            feed.changed().await.expect("followed");
            let latest = feed
                .borrow_and_update()
                .as_ref()
                .map(|published| published.latest().clone());
            let body = latest.and_then(|latest| Frame::decode_length_delimited(latest).ok()?.body);
            if let Some(Body::Snapshot(snapshot)) = body
                && snapshot
                    .aircraft
                    .iter()
                    .filter(|a| a.place().is_some())
                    .count()
                    == 13
            {
                break snapshot;
            }
        }
    })
    .await;

    // Assert
    let registered = |a: &Aircraft| {
        a.registry
            .as_ref()
            .is_some_and(|r| r.registration.is_some())
    };
    assert!(placed.is_ok_and(|snapshot| snapshot.aircraft.iter().all(registered)));
}
