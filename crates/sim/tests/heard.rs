//! The sim, heard as a receiver is: what it flies is what the feeder makes of it.

use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use feeder::beast::Reader;
use feeder::follow::follow;
use feeder::message;
use feeder::position::Position;
use feeder::proto::{
    AirGroundState, Aircraft, EmergencyPriorityStatus, Frame, Snapshot, Source, frame::Body,
};
use feeder::registry::Registry;
use feeder::traffic::Traffic;
use prost::Message;
use sim::Fleet;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::watch;

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
        let now = Arc::new(Mutex::new(1000.0));
        let clock = Arc::clone(&now);
        let fleet = Fleet::new(SITE, move || *clock.lock().expect("clock"), extra);
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
        for frame in self.reader.read(&self.fleet.fly()) {
            if let Some(observation) = message::read(&frame) {
                self.traffic.hear(&observation, now_s);
            }
        }
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

fn place(aircraft: &Aircraft) -> Option<Position> {
    let (lat_deg, lon_deg) = aircraft.lat_deg.zip(aircraft.lon_deg)?;
    Some(Position { lat_deg, lon_deg })
}

fn intent(aircraft: &Aircraft) -> [Option<i32>; 3] {
    let selected = aircraft
        .target_state
        .and_then(|target| target.selected_altitude_mcp_ft);
    [
        aircraft.baro_altitude_ft,
        selected,
        aircraft.baro_vertical_rate_fpm,
    ]
}

#[test]
fn every_aircraft_is_heard_and_placed_near_the_site() {
    // Arrange
    let mut heard = Heard::new(0);

    // Act
    let snapshot = heard.placed();

    // Assert
    let near = |a: &Aircraft| place(a).is_some_and(|place| SITE.distance_nm(place) < 60.0);
    let timed = |a: &Aircraft| {
        a.reception
            .is_some_and(|r| r.seen_s == Some(0.0) && r.seen_pos_s == Some(0.0))
    };
    assert_eq!(snapshot.aircraft.len(), 11);
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
        .filter(|(now, before)| now.address == before.address && place(now) != place(before));
    assert_eq!(moved.count(), first.aircraft.len());
    let airliner = numbered(&second, 1);
    let flown = place(numbered(&first, 1))
        .zip(place(airliner))
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
    assert_eq!(count(&|a| a.position_source() == Source::Mlat), 1);
    assert_eq!(count(&|a| a.identification.is_none()), 2);
    assert_eq!(count(&|a| a.target_state.is_some()), 5);
    let qualified = |a: &Aircraft| {
        a.quality
            .is_some_and(|q| q.nic == Some(8) && q.nac_p == Some(9))
    };
    assert_eq!(count(&qualified), 11);
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
        .filter(|a| a.mode_a_code == Some(0o7700))
        .collect();
    assert_eq!(emergencies.len(), 1);
    assert_eq!(emergencies[0].identification, None);
    assert_eq!(
        emergencies[0].emergency_priority_status(),
        EmergencyPriorityStatus::GeneralEmergency
    );
}

#[test]
fn taxiing_targets_are_on_the_ground_at_taxi_speed() {
    // Arrange
    let mut heard = Heard::new(0);

    // Act
    let snapshot = heard.placed();

    // Assert
    let ground: Vec<_> = snapshot
        .aircraft
        .iter()
        .filter(|a| a.air_ground_state() == AirGroundState::OnGround)
        .collect();
    let taxiing = |a: &&Aircraft| a.ground_speed_kt.is_some_and(|gs| gs > 0.0 && gs < 40.0);
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
    let airborne: Vec<_> = snapshot
        .aircraft
        .iter()
        .filter(|a| a.air_ground_state() != AirGroundState::OnGround)
        .collect();
    assert_eq!(airborne.len(), 9);
    let speeds = |a: &&Aircraft| {
        a.true_airspeed_kt.is_some() && a.indicated_airspeed_kt.is_some() && a.mach.is_some()
    };
    assert!(airborne.iter().all(speeds), "{airborne:?}");
    let wind = |a: &&Aircraft| {
        let wind = a.meteo.and_then(|m| m.wind_dir_deg.zip(m.wind_speed_kt));
        wind.is_some_and(|(from, speed)| (from - 270.0).abs() < 4.0 && (speed - 35.0).abs() < 3.0)
    };
    assert!(airborne.iter().all(wind), "{airborne:?}");
    let standard = |a: &&Aircraft| {
        let isa = a
            .baro_altitude_ft
            .map(|ft| 15.0 - 1.9812 * f64::from(ft) / 1000.0);
        let steps = a
            .mach
            .zip(a.true_airspeed_kt)
            .map(|(mach, tas)| 2.0 * 288.0 * (0.004 / mach + 1.0 / tas));
        let oat = a.meteo.and_then(|m| m.oat_c);
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
    let identing: Vec<_> = snapshot.aircraft.iter().filter(|a| a.ident).collect();
    assert_eq!(identing.len(), 1);
    assert_eq!(identing[0].identification.as_deref(), Some("TEST02"));
    let advised: Vec<_> = snapshot
        .aircraft
        .iter()
        .filter(|a| a.resolution_advisory.is_some())
        .collect();
    assert_eq!(advised.len(), 1);
    assert_eq!(advised[0].identification.as_deref(), Some("TEST07"));
    let advisory = advised[0]
        .resolution_advisory
        .and_then(|ra| ra.advisory)
        .expect("of one threat");
    assert!(advisory.corrective && advisory.positive && !advisory.downward);
}

#[test]
fn newly_set_level_is_started_toward_after_a_pause() {
    // Arrange
    let mut heard = Heard::new(0);
    heard.after(0.0);

    // Act
    let snapshot = heard.after(30.0);

    // Assert: 21000 ft selected and 1000 fpm, in the steps they are broadcast in
    assert_eq!(
        intent(numbered(&snapshot, 7)),
        [Some(17_000), Some(20_992), Some(1024)]
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
    let near = |a: &Aircraft| place(a).is_some_and(|place| SITE.distance_nm(place) < 60.0);
    assert_eq!(snapshot.aircraft.len(), 11 + 500);
    assert_eq!(addresses.len(), 11 + 500);
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
        .filter_map(|a| a.identification.as_deref())
        .collect();
    let registered = |a: &Aircraft| {
        let registry = a.registry.as_ref();
        let registration = registry.and_then(|r| r.registration.as_deref());
        let designator = registry.and_then(|r| r.type_designator.as_deref());
        registration.is_some_and(|r| r.starts_with("TEST-")) && designator.is_some()
    };
    assert_eq!(callsigns.len(), 9 + 50);
    assert!(
        callsigns
            .iter()
            .all(|callsign| callsign.starts_with("TEST"))
    );
    assert!(snapshot.aircraft.iter().all(registered));
}

/// Seconds since the epoch.
fn wall() -> f64 {
    let since = SystemTime::now().duration_since(UNIX_EPOCH);
    since.map_or(0.0, |since| since.as_secs_f64())
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
                    .filter(|a| place(a).is_some())
                    .count()
                    == 11
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
