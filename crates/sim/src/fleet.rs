//! Synthesized traffic around a site, for working on the scope without a receiver.
//!
//! Every identity is made up, so nothing names a real aircraft or flight:
//! callsigns are `TEST` plus digits, registrations `TEST-` plus digits, and
//! addresses come from `D00000` to `DFFFFF`, a block ICAO Annex 10 Vol III
//! reserves for future use.

use std::f64::consts::TAU;
use std::ops::Range;

use feeder::beast::Frame;
use feeder::bits::Bits;
use feeder::cpr;
use feeder::field::{
    AirbornePosition, Field, Identification, OperationalStatus, Status, SurfacePosition,
    TargetStateAndStatus, Velocity,
};
use feeder::message::squitter;
use feeder::position::Position;
use feeder::proto::{EmergencyPriorityStatus, EmitterCategory, TargetState, target_state::Modes};

/// Beyond this the aircraft is put back across the site, so the sim never empties.
const BOUNDS_NM: f64 = 55.0;
/// Seconds a crew takes to start toward a newly set level.
const SET_DELAY_S: f64 = 20.0;
/// Seconds a level is held before the next is set.
const HOLD_S: f64 = 60.0;
/// The level every message is heard at: about -8 dB against full scale.
const SIGNAL: u8 = 100;
/// The type codes of the positions, which put their containment radius under
/// 0.1 NM in the air and on the ground, and the accuracy reported with them.
const AIRBORNE_TYPE_CODE: u32 = 11;
const SURFACE_TYPE_CODE: u32 = 7;
const NAC_P: u32 = 9;

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
    use EmitterCategory::{A1Light as light, A2Small as small, A3Large as large, A5Heavy as heavy};
    let plan = |number, callsign, category, squawk, (x, y), alt, gs, track, baro_rate, kind| Plan {
        address: 0x00d0_0000 + number, number, digits: 2, callsign, category, squawk,
        x, y, alt, gs, track, baro_rate, kind, ..Plan::default()
    };
    vec![
        Plan { sel_alt: Some(6000.0), modes: Some(MANAGED),
            ..plan(1, true, large, 0o2431, (27.0, 16.0), 11_000.0, 290.0, 235.0, -1200.0, "B789") },
        Plan { sel_alt: Some(4000.0), sel_heading: Some(210.0), modes: Some(AUTOPILOT),
            ..plan(2, true, large, 0o1724, (17.0, 22.0), 9000.0, 270.0, 210.0, -1000.0, "B738") },
        Plan { sel_alt: Some(7000.0), modes: Some(MANAGED),
            ..plan(3, true, large, 0o2106, (5.0, 7.0), 5000.0, 220.0, 90.0, 1500.0, "B738") },
        plan(4, true, large, 0o4421, (-13.0, -26.0), 8000.0, 260.0, 25.0, -800.0, "B738"),
        Plan { mlat: true,
            ..plan(5, false, light, 0o1200, (-13.0, -11.0), 2500.0, 95.0, 0.0, 0.0, "C172") },
        Plan { sel_alt: Some(14_000.0), modes: Some(Modes { lnav: true, ..HOLDING }),
            ..plan(6, true, large, 0o3452, (20.0, 19.0), 14_000.0, 340.0, 255.0, 0.0, "A320") },
        Plan { sel_alt: Some(21_000.0), sel_heading: Some(260.0), modes: Some(HOLDING),
            ..plan(7, true, heavy, 0o5512, (-8.0, 31.0), 17_000.0, 380.0, 260.0, 0.0, "B74F") },
        plan(8, true, large, 0o7012, (32.0, 7.0), 7500.0, 240.0, 250.0, -600.0, "CRJ7"),
        plan(9, false, small, 0o7700, (-28.0, 10.0), 9000.0, 250.0, 95.0, -1200.0, "C68A"),
        Plan { ground: true,
            ..plan(10, true, large, 0o2201, (0.6, -0.4), 0.0, 18.0, 340.0, 0.0, "A321") },
        Plan { ground: true,
            ..plan(11, true, heavy, 0o3112, (-0.5, 0.3), 0.0, 6.0, 160.0, 0.0, "B773") },
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

/// Aircraft `numbers`, scattered by `random` within `radius_nm` of the site on straight tracks,
/// at levels and speeds drawn from `(lowest, spread)` in thousands of feet and knots; the rest
/// of each from `plan`.
fn scattered(
    random: &mut impl FnMut() -> f64,
    numbers: Range<u32>,
    radius_nm: f64,
    levels: (f64, f64),
    speeds: (f64, f64),
    plan: impl Fn(u32) -> Plan,
) -> Vec<Plan> {
    numbers
        .map(|number| {
            let range = radius_nm * random().sqrt();
            let bearing = random() * TAU;
            Plan {
                x: range * bearing.sin(),
                y: range * bearing.cos(),
                alt: 1000.0 * (levels.0 + random() * levels.1).round(),
                gs: (speeds.0 + random() * speeds.1).round(),
                track: (random() * 360.0).round(),
                ..plan(number)
            }
        })
        .collect()
}

/// `count` generic en-route targets spread over the area, for load testing.
fn extra_fleet(count: u32) -> Vec<Plan> {
    let plan = |number| Plan {
        address: 0x00d1_0000 + number,
        number,
        digits: 4,
        callsign: true,
        category: EmitterCategory::A3Large,
        squawk: 0o1000 + number % 0o6000,
        kind: "A320",
        ..Plan::default()
    };
    scattered(
        &mut mulberry32(count),
        0..count,
        50.0,
        (3.0, 35.0),
        (180.0, 300.0),
        plan,
    )
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
        }
    }

    /// Flies on along its track at its speed for `elapsed` seconds; returns how far, NM.
    fn fly_straight(&mut self, elapsed: f64) -> f64 {
        let distance = self.plan.gs * elapsed / 3600.0;
        let track = self.plan.track.to_radians();
        self.x += distance * track.sin();
        self.y += distance * track.cos();
        distance
    }

    fn advance(&mut self, now: f64, elapsed: f64) {
        self.fly_straight(elapsed);
        if self.x.hypot(self.y) > BOUNDS_NM {
            self.x *= -0.9;
            self.y *= -0.9;
        }
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

    fn name(&self, prefix: &str) -> String {
        let Plan { number, digits, .. } = self.plan;
        format!("{prefix}{number:0digits$}")
    }

    /// The message fields it broadcasts in the second of the count: a position
    /// in one format and then the other, the velocity and what is selected
    /// every second, and the rest at the longer periods of DO-260B.
    fn broadcasts(&self, site: Position, second: u64) -> Vec<Bits> {
        let plan = &self.plan;
        let odd = !second.is_multiple_of(2);
        let mut fields = self.moving(site, odd);
        fields.extend(self.selected().map(|selected| selected.write()));
        if second.is_multiple_of(3) {
            let status = OperationalStatus {
                on_ground: plan.ground,
                version: 2,
                nic_supplement_a: false,
                nic_supplement_c: false,
                nac_p: Some(NAC_P),
            };
            fields.push(status.write());
        }
        if second.is_multiple_of(5) {
            let status = Status {
                emergency_priority_status: emergency(plan.squawk),
                mode_a_code: Some(plan.squawk),
            };
            fields.push(status.write());
            let identification = plan.callsign.then(|| Identification {
                identification: Some(self.name("TEST")),
                emitter_category: plan.category,
            });
            fields.extend(identification.map(|identification| identification.write()));
        }
        fields
    }

    /// Where it is and how it moves: one message on the ground, two in the air.
    fn moving(&self, site: Position, odd: bool) -> Vec<Bits> {
        let plan = &self.plan;
        let at = Position {
            lat_deg: site.lat_deg + self.y / 60.0,
            lon_deg: site.lon_deg + self.x / (60.0 * site.lat_deg.to_radians().cos()),
        };
        if plan.ground {
            let position = SurfacePosition {
                cpr: cpr::surface(at, odd),
                ground_speed_kt: Some(plan.gs),
                track_deg: Some(plan.track),
                type_code: SURFACE_TYPE_CODE,
            };
            return vec![position.write()];
        }
        let position = AirbornePosition {
            cpr: cpr::airborne(at, odd),
            baro_altitude_ft: Some(whole(self.alt)),
            geometric_altitude_ft: None,
            type_code: AIRBORNE_TYPE_CODE,
            nic_supplement_b: false,
        };
        let velocity = Velocity {
            ground_speed_kt: Some(plan.gs),
            track_deg: Some(plan.track),
            airspeed: None,
            baro_vertical_rate_fpm: Some(whole(self.baro_rate)),
            geometric_vertical_rate_fpm: None,
            geometric_minus_baro_ft: None,
        };
        vec![position.write(), velocity.write()]
    }

    /// What is selected on the autopilot, when the aircraft reports any of it.
    fn selected(&self) -> Option<TargetStateAndStatus> {
        let plan = &self.plan;
        let target = TargetState {
            selected_altitude_mcp_ft: self.sel_alt.map(whole),
            selected_altitude_fms_ft: None,
            selected_heading_deg: plan.sel_heading,
            baro_setting_hpa: self.sel_alt.map(|_| 1013.6),
            modes: plan.modes,
        };
        let reports = target != TargetState::default();
        reports.then_some(TargetStateAndStatus {
            target,
            nac_p: NAC_P,
        })
    }
}

/// The emergency/priority status that goes with a Mode A code.
fn emergency(squawk: u32) -> EmergencyPriorityStatus {
    match squawk {
        0o7500 => EmergencyPriorityStatus::UnlawfulInterference,
        0o7600 => EmergencyPriorityStatus::NoCommunications,
        0o7700 => EmergencyPriorityStatus::GeneralEmergency,
        _ => EmergencyPriorityStatus::NoEmergency,
    }
}

/// Rounded; the values stay far inside the type's range.
#[allow(clippy::cast_possible_truncation)]
fn whole(value: f64) -> i32 {
    value.round() as i32
}

/// The aircraft of the sim, flown by a clock.
pub struct Fleet {
    site: Position,
    clock: Box<dyn Fn() -> f64 + Send>,
    started: f64,
    last: f64,
    /// How many times it has been flown on.
    flown: u64,
    flying: Vec<Flying>,
}

impl Fleet {
    /// The fleet and `extra` generic targets around `site`; `clock` gives sim
    /// seconds since the epoch.
    pub fn new(site: Position, clock: impl Fn() -> f64 + Send + 'static, extra: u32) -> Self {
        let now = clock();
        let plans = fleet().into_iter().chain(extra_fleet(extra));
        Self::starting(
            site,
            clock,
            now,
            plans.map(|plan| Flying::new(plan, now)).collect(),
        )
    }

    /// The fleet around `site` with `flying` under way as of `now` by `clock`.
    fn starting(
        site: Position,
        clock: impl Fn() -> f64 + Send + 'static,
        now: f64,
        flying: Vec<Flying>,
    ) -> Self {
        Self {
            site,
            clock: Box::new(clock),
            started: now,
            last: now,
            flown: 0,
            flying,
        }
    }

    /// Flies the aircraft on to now, and gives what they broadcast then, as
    /// the Beast frames of a receiver that hears every message. It is meant
    /// to be flown once a sim second.
    pub fn fly(&mut self) -> Vec<u8> {
        let now = (self.clock)();
        let elapsed = (now - self.last).max(0.0);
        self.last = now;
        let timestamp = ticks(now - self.started);
        let mut frames = Vec::new();
        for flying in &mut self.flying {
            flying.advance(now, elapsed);
            // readsb marks a position found by multilateration so, and measures no signal.
            let (timestamp, signal) = if flying.plan.mlat {
                (Frame::MULTILATERATED, 0)
            } else {
                (timestamp, SIGNAL)
            };
            for me in flying.broadcasts(self.site, self.flown) {
                let message = squitter(flying.plan.address, me);
                let frame = Frame::new(timestamp, signal, &message);
                frames.extend(frame.into_iter().flat_map(|frame| frame.write()));
            }
        }
        self.flown += 1;
        frames
    }

    /// What each aircraft is registered as: its address, its registration and
    /// its type designator.
    pub fn registered(&self) -> impl Iterator<Item = (u32, String, String)> + '_ {
        self.flying.iter().map(|flying| {
            (
                flying.plan.address,
                flying.name("TEST-"),
                flying.plan.kind.to_owned(),
            )
        })
    }
}

/// The count of a receiver's 12 MHz clock after the seconds.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn ticks(seconds: f64) -> u64 {
    (seconds.max(0.0) * 12e6) as u64
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use feeder::position::Position;

    use super::Fleet;

    /// RJFF
    const SITE: Position = Position {
        lat_deg: 33.5844,
        lon_deg: 130.4517,
    };

    /// A fleet at second 1000 and the hand that moves its clock.
    fn fleet(extra: u32) -> (Fleet, impl Fn(f64)) {
        let now = Arc::new(Mutex::new(1000.0));
        let hand = Arc::clone(&now);
        let fleet = Fleet::new(SITE, move || *now.lock().expect("clock"), extra);
        (fleet, move |seconds| {
            *hand.lock().expect("clock") += seconds;
        })
    }

    #[test]
    fn traffic_is_the_same_on_every_run() {
        // Arrange
        let (mut first, advance_first) = fleet(50);
        let (mut second, advance_second) = fleet(50);
        let mut sent = [Vec::new(), Vec::new()];

        // Act
        for _ in 0..3 {
            sent[0].push(first.fly());
            sent[1].push(second.fly());
            advance_first(1.0);
            advance_second(1.0);
        }

        // Assert
        assert!(sent[0].iter().all(|frames| !frames.is_empty()));
        assert_eq!(sent[0], sent[1]);
    }

    #[test]
    fn every_identity_is_fictional() {
        // Arrange
        let (fleet, _) = fleet(50);

        // Act
        let registered: Vec<_> = fleet.registered().collect();

        // Assert
        let reserved = 0x00d0_0000..=0x00df_ffff;
        assert_eq!(registered.len(), 11 + 50);
        assert!(
            registered
                .iter()
                .all(|(address, ..)| reserved.contains(address))
        );
        assert!(
            registered
                .iter()
                .all(|(_, registration, _)| registration.starts_with("TEST-"))
        );
    }
}
