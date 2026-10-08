//! Synthesized traffic around a site, for working on the scope without a receiver.
//!
//! Every identity is made up, so nothing names a real aircraft or flight:
//! callsigns are `TEST` plus digits, registrations `TEST-` plus digits, and
//! addresses come from `D00000` to `DFFFFF`, a block ICAO Annex 10 Vol III
//! reserves for future use.

use std::f64::consts::TAU;
use std::ops::Range;
use std::sync::Arc;

use feeder::air::{self, Wind};
use feeder::beast::Frame;
use feeder::bits::Bits;
use feeder::cpr;
use feeder::field::{
    AirbornePosition, Field, Identification, OperationalStatus, Status, SurfacePosition,
    TargetStateAndStatus, Velocity,
};
use feeder::message::{comm_b_reply, squitter};
use feeder::position::Position;
use feeder::proto::{EmergencyPriorityStatus, EmitterCategory, TargetState, target_state::Modes};
use feeder::register::{HeadingAndSpeed, TrackAndTurn};
use feeder::wmm;
use placer::rng::mulberry32;

use crate::Scenario;

/// Beyond this the aircraft is put back across the site, so the sim never empties.
const BOUNDS_NM: f64 = 55.0;
/// Seconds a crew takes to start toward a newly set level.
const SET_DELAY_S: f64 = 20.0;
/// Seconds a level is held before the next is set.
const HOLD_S: f64 = 60.0;
/// The level every message is heard at: about -8 dB against full scale.
const SIGNAL: u8 = 100;
/// The wind the fleet flies in, which its air data differ by from its motion
/// over the ground.
const WIND: Wind = Wind {
    from_deg: 270.0,
    speed_kt: 35.0,
};
/// The type codes of the positions, which put their containment radius under
/// 0.1 NM in the air and on the ground, and the accuracy reported with them.
const AIRBORNE_TYPE_CODE: u32 = 11;
const SURFACE_TYPE_CODE: u32 = 7;
const NAC_P: u32 = 9;
/// Standard rate of turn, degrees per second.
const TURN_DEG_PER_S: f64 = 3.0;
/// Within this of a waypoint the next leg begins, NM.
const AT_NM: f64 = 0.15;
const STEEPEST_FPM: f64 = 2500.0;
/// No route takes longer than this to fly; a probe of one gives up here.
const LONGEST_ROUTE_S: f64 = 7200.0;

/// A waypoint of a route: where to pass, and the level and speed to be at there.
#[derive(Debug)]
pub struct Leg {
    /// NM east and north of the site.
    pub x: f64,
    pub y: f64,
    pub alt: f64,
    pub gs: f64,
}

/// The waypoints an arrival flies in turn, landing at the last and starting over.
pub type Route = Arc<[Leg]>;

/// Where an aircraft is and how it moves, as the sim knows it.
#[derive(Debug)]
pub struct State {
    pub address: u32,
    /// NM east and north of the site.
    pub x: f64,
    pub y: f64,
    pub alt_ft: f64,
    pub gs_kt: f64,
    pub track_deg: f64,
    pub turn_deg_per_s: f64,
}

/// True bearing from one point to another, degrees.
fn bearing(from_x: f64, from_y: f64, to_x: f64, to_y: f64) -> f64 {
    (to_x - from_x)
        .atan2(to_y - from_y)
        .to_degrees()
        .rem_euclid(360.0)
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
    /// Beyond this it is put back across the site; the fleet's bounds when 0.
    bounds: f64,
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

/// An arrival of a scenario, numbered on from the streams before it.
fn arrival(number: u32) -> Plan {
    Plan {
        address: 0x00d2_0000 + number,
        number,
        digits: 4,
        callsign: true,
        category: EmitterCategory::A3Large,
        squawk: 0o1000 + number % 0o6000,
        kind: if number.is_multiple_of(2) {
            "A320"
        } else {
            "B738"
        },
        ..Plan::default()
    }
}

/// `count` aircraft crossing within `radius_nm` of the site on straight tracks between FL050
/// and FL250, placed by `random`, and kept within half again the radius.
fn background(
    random: &mut impl FnMut() -> f64,
    from: u32,
    count: u32,
    radius_nm: f64,
) -> Vec<Plan> {
    let plan = |number| Plan {
        bounds: 1.5 * radius_nm,
        ..arrival(number)
    };
    scattered(
        random,
        from..from + count,
        radius_nm,
        (5.0, 20.0),
        (250.0, 200.0),
        plan,
    )
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
    /// The route an arrival flies, and the leg it is on.
    route: Option<Route>,
    leg: usize,
    /// Degrees per second, as it last turned.
    turning: f64,
    /// How many times it has reached the end of its route.
    landed: bool,
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
            route: None,
            leg: 0,
            turning: 0.0,
            landed: false,
        }
    }

    /// One aircraft flying a route from its start, as a scenario's arrivals do.
    fn routed(plan: Plan, route: Route, now: f64) -> Self {
        let mut flying = Self::new(plan, now);
        flying.route = Some(route);
        flying.restart();
        flying
    }

    /// Back to the start of the route, heading for its second waypoint.
    fn restart(&mut self) {
        let Some(route) = self.route.clone() else {
            return;
        };
        let (Some(first), Some(next)) = (route.first(), route.get(1)) else {
            return;
        };
        self.x = first.x;
        self.y = first.y;
        self.alt = first.alt;
        self.plan.gs = first.gs;
        self.plan.track = bearing(first.x, first.y, next.x, next.y);
        self.leg = 1;
    }

    /// Turns toward the leg's waypoint at the standard rate, flies at the speed of the one it
    /// left, and climbs or descends so as to be at its level there; past the last waypoint it
    /// starts over.
    fn follow(&mut self, route: &Route, elapsed: f64) {
        let Some(target) = route.get(self.leg) else {
            return;
        };
        let to_go = (target.x - self.x).hypot(target.y - self.y);
        let wanted = bearing(self.x, self.y, target.x, target.y);
        let off = (wanted - self.plan.track + 540.0).rem_euclid(360.0) - 180.0;
        let most = TURN_DEG_PER_S * elapsed;
        let turn = off.clamp(-most, most);
        self.plan.track = (self.plan.track + turn).rem_euclid(360.0);
        self.turning = if elapsed > 0.0 { turn / elapsed } else { 0.0 };
        self.plan.gs = route.get(self.leg - 1).map_or(target.gs, |from| from.gs);
        let distance = self.fly_straight(elapsed);
        let minutes = (to_go / self.plan.gs.max(1.0) * 60.0).max(elapsed / 60.0);
        self.baro_rate = ((target.alt - self.alt) / minutes).clamp(-STEEPEST_FPM, STEEPEST_FPM);
        let climbed = self.baro_rate * elapsed / 60.0;
        self.alt = if climbed.abs() >= (target.alt - self.alt).abs() {
            target.alt
        } else {
            self.alt + climbed
        };
        if to_go <= AT_NM.max(distance) {
            self.leg += 1;
            if self.leg >= route.len() {
                self.landed = true;
                self.restart();
            }
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
        if let Some(route) = self.route.clone() {
            self.follow(&route, elapsed);
            return;
        }
        self.fly_straight(elapsed);
        let bounds = if self.plan.bounds > 0.0 {
            self.plan.bounds
        } else {
            BOUNDS_NM
        };
        if self.x.hypot(self.y) > bounds {
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

    /// What it answers to a radar's interrogations in the air: the track and
    /// turn report and the heading and speed report, flying through the
    /// standard air in the wind, the heading as magnetic by the declination.
    fn answers(&self, declination_deg: f64) -> Vec<Bits> {
        let plan = &self.plan;
        if plan.ground {
            return vec![];
        }
        let (heading, airspeed) = air::through_air(plan.track, plan.gs, WIND);
        let mach = air::mach(airspeed, self.alt);
        let track_and_turn = TrackAndTurn {
            roll_deg: None,
            track_deg: Some(plan.track),
            ground_speed_kt: Some(plan.gs),
            track_rate_deg_per_s: Some(self.turning),
            true_airspeed_kt: Some(airspeed),
        };
        let heading_and_speed = HeadingAndSpeed {
            magnetic_heading_deg: Some((heading - declination_deg).rem_euclid(360.0)),
            indicated_airspeed_kt: Some(air::calibrated_airspeed_kt(mach, self.alt)),
            mach: Some(mach),
            baro_vertical_rate_fpm: Some(whole(self.baro_rate)),
            inertial_vertical_rate_fpm: Some(whole(self.baro_rate)),
        };
        vec![track_and_turn.write(), heading_and_speed.write()]
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

    /// A scenario's streams and its background traffic around `site`, the same for a `seed`
    /// and different between seeds, with `extra` background aircraft besides; `clock` gives sim seconds since the epoch.
    pub fn scenario(
        site: Position,
        clock: impl Fn() -> f64 + Send + 'static,
        scenario: Scenario,
        seed: u32,
        extra: u32,
    ) -> Self {
        let now = clock();
        let mut random = mulberry32(seed);
        let mut flying = Vec::new();
        let mut number = 0;
        for stream in scenario.streams(&mut random) {
            let route: Route = stream.route.into();
            let route_s = route_seconds(&route);
            let count = (route_s / stream.interval_s).round().max(1.0);
            let interval = route_s / count;
            let phase = stream.phase + random() * 0.2;
            for k in 0..whole(count) {
                let mut arrival = Flying::routed(arrival(number), Arc::clone(&route), now);
                number += 1;
                for _ in 0..whole((f64::from(k) + phase) * interval) {
                    arrival.advance(now, 1.0);
                }
                flying.push(arrival);
            }
        }
        let density = 0.6 + 0.8 * random();
        let count = whole(f64::from(scenario.background()) * density).unsigned_abs() + extra;
        let plans = background(&mut random, number, count, scenario.range_nm());
        flying.extend(plans.into_iter().map(|plan| Flying::new(plan, now)));
        Self::starting(site, clock, now, flying)
    }

    /// Where every aircraft is and how it moves, as of the last flight.
    pub fn states(&self) -> impl Iterator<Item = State> + '_ {
        self.flying.iter().map(|f| State {
            address: f.plan.address,
            x: f.x,
            y: f.y,
            alt_ft: f.alt,
            gs_kt: f.plan.gs,
            track_deg: f.plan.track,
            turn_deg_per_s: f.turning,
        })
    }

    /// Flies the aircraft on to now, and gives what they broadcast then, as
    /// the Beast frames of a receiver that hears every message. It is meant
    /// to be flown once a sim second.
    pub fn fly(&mut self) -> Vec<u8> {
        let now = (self.clock)();
        let elapsed = (now - self.last).max(0.0);
        self.last = now;
        let timestamp = ticks(now - self.started);
        let declination = wmm::declination_deg(self.site, wmm::year_of(now));
        let mut frames = Vec::new();
        for flying in &mut self.flying {
            flying.advance(now, elapsed);
            // readsb marks a position found by multilateration so, and measures no signal.
            let (timestamp, signal) = if flying.plan.mlat {
                (Frame::MULTILATERATED, 0)
            } else {
                (timestamp, SIGNAL)
            };
            let mut heard = |message: &[u8]| {
                let frame = Frame::new(timestamp, signal, message);
                frames.extend(frame.into_iter().flat_map(|frame| frame.write()));
            };
            let address = flying.plan.address;
            for me in flying.broadcasts(self.site, self.flown) {
                heard(&squitter(address, me));
            }
            for mb in flying.answers(declination) {
                heard(&comm_b_reply(address, Some(whole(flying.alt)), mb));
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

/// How long a route takes to fly, by flying it.
fn route_seconds(route: &Route) -> f64 {
    let mut probe = Flying::routed(Plan::default(), Arc::clone(route), 0.0);
    let mut seconds = 0.0;
    while !probe.landed && seconds < LONGEST_ROUTE_S {
        probe.advance(0.0, 1.0);
        seconds += 1.0;
    }
    seconds
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
