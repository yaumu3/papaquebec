//! Synthesized traffic around a site, for working on the scope without a receiver.
//!
//! Every identity is made up, so nothing names a real aircraft or flight:
//! callsigns are `TEST` plus digits, registrations `TEST-` plus digits, and
//! addresses come from `D00000` to `DFFFFF`, a block ICAO Annex 10 Vol III
//! reserves for future use.

use std::f64::consts::TAU;

use super::Upstream;
use crate::Failure;
use crate::proto::{
    Address, AddressType, AirGroundState, Aircraft, EmitterCategory, Quality, Receiver, Reception,
    Registry, Snapshot, Source, TargetState, target_state::Modes,
};

/// Beyond this the aircraft is put back across the site, so the sim never empties.
const BOUNDS_NM: f64 = 55.0;
/// Seconds a crew takes to start toward a newly set level.
const SET_DELAY_S: f64 = 20.0;
/// Seconds a level is held before the next is set.
const HOLD_S: f64 = 60.0;
/// What a receiver decodes each second, over all aircraft and from each.
const MESSAGES_PER_S: f64 = 12.0;
const MESSAGES_PER_AIRCRAFT_S: f64 = 2.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Site {
    pub lat_deg: f64,
    pub lon_deg: f64,
}

/// One aircraft as it starts out.
#[derive(Clone, Copy, Default)]
struct Plan {
    address: u32,
    /// The digits of the callsign and registration.
    number: u32,
    digits: usize,
    /// Broadcasts no callsign when false.
    callsign: bool,
    category: EmitterCategory,
    squawk: u32,
    /// Offset from the site in NM, x east and y north.
    x: f64,
    y: f64,
    alt: f64,
    gs: f64,
    track: f64,
    baro_rate: f64,
    /// Reports being on the ground; `gs` is then taxi speed.
    ground: bool,
    mlat: bool,
    /// The level set on the autopilot, which it levels off at.
    sel_alt: Option<f64>,
    sel_heading: Option<f64>,
    modes: Option<Modes>,
    kind: &'static str,
}

const AUTOPILOT: Modes = Modes {
    autopilot: true,
    vnav: false,
    altitude_hold: false,
    approach: false,
    lnav: false,
    tcas: false,
};
const MANAGED: Modes = Modes {
    vnav: true,
    lnav: true,
    ..AUTOPILOT
};
const HOLDING: Modes = Modes {
    altitude_hold: true,
    ..AUTOPILOT
};

/// A small fleet that exercises every color, glyph and prefix the scope draws.
#[rustfmt::skip]
fn fleet() -> Vec<Plan> {
    use EmitterCategory::{A1Light, A2Small, A3Large, A5Heavy};
    let plan = |number, callsign, category, squawk, (x, y), alt, gs, track, baro_rate, kind| Plan {
        address: 0x00d0_0000 + number, number, digits: 2, callsign, category, squawk,
        x, y, alt, gs, track, baro_rate, kind, ..Plan::default()
    };
    vec![
        Plan { sel_alt: Some(6000.0), modes: Some(MANAGED),
            ..plan(1, true, A3Large, 0o2431, (27.0, 16.0), 11_000.0, 290.0, 235.0, -1200.0, "B789") },
        Plan { sel_alt: Some(4000.0), sel_heading: Some(210.0), modes: Some(AUTOPILOT),
            ..plan(2, true, A3Large, 0o1724, (17.0, 22.0), 9000.0, 270.0, 210.0, -1000.0, "B738") },
        Plan { sel_alt: Some(7000.0), modes: Some(MANAGED),
            ..plan(3, true, A3Large, 0o2106, (5.0, 7.0), 5000.0, 220.0, 90.0, 1500.0, "B738") },
        plan(4, true, A3Large, 0o4421, (-13.0, -26.0), 8000.0, 260.0, 25.0, -800.0, "B738"),
        Plan { mlat: true,
            ..plan(5, false, A1Light, 0o1200, (-13.0, -11.0), 2500.0, 95.0, 0.0, 0.0, "C172") },
        Plan { sel_alt: Some(14_000.0), modes: Some(Modes { lnav: true, ..HOLDING }),
            ..plan(6, true, A3Large, 0o3452, (20.0, 19.0), 14_000.0, 340.0, 255.0, 0.0, "A320") },
        Plan { sel_alt: Some(21_000.0), sel_heading: Some(260.0), modes: Some(HOLDING),
            ..plan(7, true, A5Heavy, 0o5512, (-8.0, 31.0), 17_000.0, 380.0, 260.0, 0.0, "B74F") },
        plan(8, true, A3Large, 0o7012, (32.0, 7.0), 7500.0, 240.0, 250.0, -600.0, "CRJ7"),
        plan(9, false, A2Small, 0o7700, (-28.0, 10.0), 9000.0, 250.0, 95.0, -1200.0, "C68A"),
        Plan { ground: true,
            ..plan(10, true, A3Large, 0o2201, (0.6, -0.4), 0.0, 18.0, 340.0, 0.0, "A321") },
        Plan { ground: true,
            ..plan(11, true, A5Heavy, 0o3112, (-0.5, 0.3), 0.0, 6.0, 160.0, 0.0, "B773") },
    ]
}

/// Deterministic random numbers in 0 to 1 (mulberry32), so a load test sees
/// the same traffic every run.
fn mulberry32(seed: u32) -> impl FnMut() -> f64 {
    let mut state = seed;
    move || {
        state = state.wrapping_add(0x6d2b_79f5);
        let mut t = (state ^ (state >> 15)).wrapping_mul(1 | state);
        t = t.wrapping_add((t ^ (t >> 7)).wrapping_mul(0x3d | t)) ^ t;
        f64::from(t ^ (t >> 14)) / 4_294_967_296.0
    }
}

/// `count` generic en-route targets spread over the area, for load testing.
fn extra_fleet(count: u32) -> Vec<Plan> {
    const RADIUS_NM: f64 = 50.0;
    let mut random = mulberry32(count);
    let plans = (0..count).map(|number| {
        let range = RADIUS_NM * random().sqrt();
        let bearing = random() * TAU;
        Plan {
            address: 0x00d1_0000 + number,
            number,
            digits: 4,
            callsign: true,
            category: EmitterCategory::A3Large,
            squawk: 0o1000 + number % 0o6000,
            x: range * bearing.sin(),
            y: range * bearing.cos(),
            alt: 1000.0 * (3.0 + random() * 35.0).round(),
            gs: (180.0 + random() * 300.0).round(),
            track: (random() * 360.0).round(),
            kind: "A320",
            ..Plan::default()
        }
    });
    plans.collect()
}

/// One aircraft under way.
struct Flying {
    plan: Plan,
    x: f64,
    y: f64,
    alt: f64,
    baro_rate: f64,
    sel_alt: Option<f64>,
    /// The level it started at, set again once the selected one has been held.
    from: f64,
    /// Climb or descent rate, fpm.
    rate: f64,
    /// When the selected level was set or reached.
    since: f64,
    messages: f64,
}

impl Flying {
    fn new(plan: Plan, now: f64) -> Self {
        let rate = plan.baro_rate.abs();
        Self {
            plan,
            x: plan.x,
            y: plan.y,
            alt: plan.alt,
            baro_rate: plan.baro_rate,
            sel_alt: plan.sel_alt,
            from: plan.alt,
            rate: if rate > 0.0 { rate } else { 1000.0 },
            since: now,
            messages: 0.0,
        }
    }

    fn advance(&mut self, now: f64, elapsed: f64) {
        let distance = self.plan.gs * elapsed / 3600.0;
        let track = self.plan.track.to_radians();
        self.x += distance * track.sin();
        self.y += distance * track.cos();
        if self.x.hypot(self.y) > BOUNDS_NM {
            self.x *= -0.9;
            self.y *= -0.9;
        }
        self.messages += MESSAGES_PER_AIRCRAFT_S * elapsed;
        self.fly_level(now, elapsed);
    }

    /// Levels off on reaching the selected level, holds it, then sets the level it came from.
    #[allow(clippy::float_cmp)]
    fn fly_level(&mut self, now: f64, elapsed: f64) {
        self.alt = (self.alt + self.baro_rate * elapsed / 60.0).max(0.0);
        let Some(selected) = self.sel_alt else { return };
        if self.baro_rate * (selected - self.alt) < 0.0 {
            self.alt = selected;
            self.baro_rate = 0.0;
            self.since = now;
        } else if self.baro_rate == 0.0 && self.alt != selected && now - self.since >= SET_DELAY_S {
            self.baro_rate = (selected - self.alt).signum() * self.rate;
        } else if self.alt == selected && self.from != selected && now - self.since >= HOLD_S {
            self.sel_alt = Some(self.from);
            self.from = selected;
            self.since = now;
        }
    }

    fn aircraft(&self, site: Site) -> Aircraft {
        let Plan { number, digits, .. } = self.plan;
        let plan = &self.plan;
        let target = TargetState {
            selected_altitude_mcp_ft: self.sel_alt.map(whole),
            selected_heading_deg: plan.sel_heading,
            baro_setting_hpa: self.sel_alt.map(|_| 1013.6),
            modes: plan.modes,
            ..TargetState::default()
        };
        Aircraft {
            address: Some(Address {
                value: plan.address,
                r#type: AddressType::Icao.into(),
            }),
            identification: plan.callsign.then(|| format!("TEST{number:0digits$}")),
            emitter_category: Some(plan.category.into()),
            mode_a_code: Some(plan.squawk),
            lat_deg: Some(site.lat_deg + self.y / 60.0),
            lon_deg: Some(site.lon_deg + self.x / (60.0 * site.lat_deg.to_radians().cos())),
            position_source: if plan.mlat {
                Source::Mlat
            } else {
                Source::Unspecified
            }
            .into(),
            air_ground_state: if plan.ground {
                AirGroundState::OnGround.into()
            } else {
                AirGroundState::Unspecified.into()
            },
            baro_altitude_ft: (!plan.ground).then(|| whole(self.alt)),
            ground_speed_kt: Some(plan.gs),
            track_deg: Some(plan.track),
            baro_vertical_rate_fpm: Some(whole(self.baro_rate)),
            target_state: Some(target).filter(|target| *target != TargetState::default()),
            quality: Some(Quality {
                nic: Some(8),
                nac_p: Some(9),
            }),
            registry: Some(Registry {
                registration: Some(format!("TEST-{number:0digits$}")),
                type_designator: Some(plan.kind.into()),
                type_description: None,
            }),
            reception: Some(Reception {
                messages: Some(count(self.messages)),
                rssi_dbfs: None,
                seen_s: Some(0.3),
                seen_pos_s: Some(0.3),
            }),
            ..Aircraft::default()
        }
    }
}

/// Rounded; the values stay far inside the type's range.
#[allow(clippy::cast_possible_truncation)]
fn whole(value: f64) -> i32 {
    value.round() as i32
}

/// Rounded; the values are never negative.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn count(value: f64) -> u64 {
    value.round() as u64
}

/// A clock in sim seconds that runs `speed` times faster than `wall`, which is in seconds.
pub fn sim_clock(speed: f64, wall: impl Fn() -> f64) -> impl Fn() -> f64 {
    let start = wall();
    move || start + (wall() - start) * speed
}

pub struct Sim {
    site: Site,
    clock: Box<dyn Fn() -> f64 + Send>,
    last: f64,
    messages: f64,
    flying: Vec<Flying>,
}

impl Sim {
    /// The fleet and `extra` generic targets around `site`; `clock` gives sim
    /// seconds since the epoch.
    pub fn new(site: Site, clock: impl Fn() -> f64 + Send + 'static, extra: u32) -> Self {
        let now = clock();
        let plans = fleet().into_iter().chain(extra_fleet(extra));
        Self {
            site,
            clock: Box::new(clock),
            last: now,
            messages: 0.0,
            flying: plans.map(|plan| Flying::new(plan, now)).collect(),
        }
    }

    /// The traffic now, moved on by the time since it was last asked for.
    fn fly(&mut self) -> Snapshot {
        let now = (self.clock)();
        let elapsed = (now - self.last).max(0.0);
        self.last = now;
        self.messages += MESSAGES_PER_S * elapsed;
        for flying in &mut self.flying {
            flying.advance(now, elapsed);
        }
        Snapshot {
            now_s: now,
            messages: count(self.messages),
            aircraft: self
                .flying
                .iter()
                .map(|flying| flying.aircraft(self.site))
                .collect(),
        }
    }
}

impl Upstream for Sim {
    fn receiver(&mut self) -> impl Future<Output = Result<Receiver, Failure>> + Send {
        std::future::ready(Ok(Receiver {
            lat_deg: Some(self.site.lat_deg),
            lon_deg: Some(self.site.lon_deg),
        }))
    }

    fn snapshot(&mut self) -> impl Future<Output = Result<Snapshot, Failure>> + Send {
        std::future::ready(Ok(self.fly()))
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;
    use std::sync::{Arc, Mutex};

    use super::{Sim, Site, sim_clock};
    use crate::proto::{AirGroundState, Aircraft, Receiver, Snapshot, Source};
    use crate::upstream::Upstream;

    /// RJFF
    const SITE: Site = Site {
        lat_deg: 33.5844,
        lon_deg: 130.4517,
    };

    fn assert_close(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() < 1e-9,
            "{actual} is not {expected}"
        );
    }

    /// A sim at second 1000 and the hand that moves its clock.
    fn sim(extra: u32) -> (Sim, impl Fn(f64)) {
        let now = Arc::new(Mutex::new(1000.0));
        let hand = Arc::clone(&now);
        let sim = Sim::new(SITE, move || *now.lock().expect("clock"), extra);
        (sim, move |seconds| *hand.lock().expect("clock") += seconds)
    }

    fn named<'a>(snapshot: &'a Snapshot, identification: &str) -> &'a Aircraft {
        let is = |a: &&Aircraft| a.identification.as_deref() == Some(identification);
        snapshot.aircraft.iter().find(is).expect("in the fleet")
    }

    fn intent(aircraft: &Aircraft) -> [Option<i32>; 3] {
        let selected = aircraft
            .target_state
            .and_then(|t| t.selected_altitude_mcp_ft);
        [
            aircraft.baro_altitude_ft,
            selected,
            aircraft.baro_vertical_rate_fpm,
        ]
    }

    #[test]
    fn every_aircraft_moves_along_its_track() {
        // Arrange
        let (mut sim, advance) = sim(0);
        let first = sim.fly();
        advance(10.0);

        // Act
        let second = sim.fly();

        // Assert
        let moved = second
            .aircraft
            .iter()
            .zip(&first.aircraft)
            .filter(|(now, before)| {
                now.address == before.address
                    && (now.lat_deg, now.lon_deg) != (before.lat_deg, before.lon_deg)
            });
        assert_close(second.now_s, 1010.0);
        assert_eq!(moved.count(), first.aircraft.len());
    }

    #[test]
    fn messages_are_counted_in_proportion_to_elapsed_time() {
        // Arrange
        let (mut sim, advance) = sim(0);
        let first = sim.fly();
        advance(10.0);

        // Act
        let second = sim.fly();

        // Assert
        assert_eq!(second.messages - first.messages, 120);
    }

    #[test]
    fn fleet_exercises_every_glyph_and_color() {
        // Arrange
        let (mut sim, _) = sim(0);

        // Act
        let snapshot = sim.fly();

        // Assert
        let mlat = |a: &&Aircraft| a.position_source() == Source::Mlat;
        let heard = |a: &Aircraft| {
            a.reception
                .is_some_and(|r| r.seen_s.is_some() && r.seen_pos_s.is_some())
        };
        assert_eq!(snapshot.aircraft.iter().filter(mlat).count(), 1);
        assert!(snapshot.aircraft.iter().all(heard));
    }

    #[test]
    fn emergency_is_on_a_target_without_a_callsign() {
        // Arrange
        let (mut sim, _) = sim(0);

        // Act
        let snapshot = sim.fly();

        // Assert
        let emergencies: Vec<_> = snapshot
            .aircraft
            .iter()
            .filter(|a| a.mode_a_code == Some(0o7700))
            .collect();
        assert_eq!(emergencies.len(), 1);
        assert_eq!(emergencies[0].identification, None);
    }

    #[test]
    fn taxiing_targets_are_on_the_ground_at_taxi_speed() {
        // Arrange
        let (mut sim, _) = sim(0);

        // Act
        let snapshot = sim.fly();

        // Assert
        let ground: Vec<_> = snapshot
            .aircraft
            .iter()
            .filter(|a| a.air_ground_state() == AirGroundState::OnGround)
            .collect();
        let taxiing = |a: &&Aircraft| a.ground_speed_kt.is_some_and(|gs| gs > 0.0 && gs < 40.0);
        assert!(ground.len() >= 2);
        assert!(ground.iter().all(taxiing));
        assert!(ground.iter().all(|a| a.baro_altitude_ft.is_none()));
        assert!(ground.iter().all(|a| a.baro_vertical_rate_fpm == Some(0)));
    }

    #[test]
    fn newly_set_level_is_started_toward_after_a_pause() {
        // Arrange
        let (mut sim, advance) = sim(0);
        sim.fly();
        advance(30.0);

        // Act
        let snapshot = sim.fly();

        // Assert
        assert_eq!(
            intent(named(&snapshot, "TEST07")),
            [Some(17_000), Some(21_000), Some(1000)]
        );
    }

    #[test]
    fn level_it_came_from_is_set_once_the_selected_one_was_held() {
        // Arrange
        let (mut sim, advance) = sim(0);
        sim.fly();
        advance(200.0);
        sim.fly();
        advance(100.0);

        // Act
        let snapshot = sim.fly();

        // Assert
        assert_eq!(
            intent(named(&snapshot, "TEST03")),
            [Some(7000), Some(5000), Some(0)]
        );
    }

    #[test]
    fn extra_traffic_is_added_within_the_bounds() {
        // Arrange
        let base = sim(0).0.fly().aircraft.len();
        let (mut sim, _) = sim(500);

        // Act
        let snapshot = sim.fly();

        // Assert
        let addresses: HashSet<_> = snapshot
            .aircraft
            .iter()
            .filter_map(|a| a.address.map(|address| address.value))
            .collect();
        let near = |a: &Aircraft| {
            let (lat, lon) = (a.lat_deg.unwrap_or(0.0), a.lon_deg.unwrap_or(0.0));
            (lat - SITE.lat_deg).abs() < 1.0 && (lon - SITE.lon_deg).abs() < 1.2
        };
        assert_eq!(snapshot.aircraft.len(), base + 500);
        assert_eq!(addresses.len(), base + 500);
        assert!(snapshot.aircraft.iter().all(near));
    }

    #[test]
    fn every_identity_is_fictional() {
        // Arrange
        let (mut sim, _) = sim(50);

        // Act
        let snapshot = sim.fly();

        // Assert
        let callsigns: Vec<_> = snapshot
            .aircraft
            .iter()
            .filter_map(|a| a.identification.as_deref())
            .collect();
        let registered = |a: &Aircraft| {
            let registry = a.registry.as_ref();
            registry
                .and_then(|r| r.registration.as_deref())
                .is_some_and(|r| r.starts_with("TEST-"))
        };
        let reserved = |a: &Aircraft| {
            a.address
                .is_some_and(|address| (0x00d0_0000..=0x00df_ffff).contains(&address.value))
        };
        assert!(callsigns.len() > 50);
        assert!(
            callsigns
                .iter()
                .all(|callsign| callsign.starts_with("TEST"))
        );
        assert!(snapshot.aircraft.iter().all(registered));
        assert!(snapshot.aircraft.iter().all(reserved));
    }

    #[test]
    fn extra_traffic_is_placed_the_same_way_on_every_run() {
        // Arrange
        let first = sim(50).0.fly();
        let (mut sim, _) = sim(50);

        // Act
        let second = sim.fly();

        // Assert
        assert_eq!(second, first);
    }

    #[test]
    fn sim_clock_runs_at_a_multiple_of_wall_time() {
        // Arrange
        let wall = Arc::new(Mutex::new(1000.0));
        let hand = Arc::clone(&wall);
        let clock = sim_clock(10.0, move || *wall.lock().expect("clock"));
        *hand.lock().expect("clock") += 3.0;

        // Act
        let now = clock();

        // Assert
        assert_close(now, 1030.0);
    }

    #[tokio::test]
    async fn receiver_is_at_the_site() {
        // Arrange
        let (mut sim, _) = sim(0);

        // Act
        let receiver = sim.receiver().await;

        // Assert
        let expected = Receiver {
            lat_deg: Some(SITE.lat_deg),
            lon_deg: Some(SITE.lon_deg),
        };
        assert_eq!(receiver.ok(), Some(expected));
    }
}
