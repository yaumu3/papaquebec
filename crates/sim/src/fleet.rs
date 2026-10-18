//! Synthesized traffic around a site, for working on the scope without a receiver.
//!
//! Every identity is made up, so nothing names a real aircraft or flight:
//! callsigns are `TEST` plus digits, registrations `TEST-` plus digits, and
//! addresses come from `D00000` to `DFFFFF`, a block ICAO Annex 10 Vol III
//! reserves for future use.

use std::ops::Range;
use std::sync::Arc;

use placer::rng::mulberry32;
use tracker::air::{self, Wind};
use tracker::beast::Frame;
use tracker::bits::Bits;
use tracker::cpr;
use tracker::field::{
    AirbornePosition, Field, Identification, ModesReported, OperationalStatus, RaBroadcast, Status,
    SurfacePosition, TargetState, TargetStateAndStatus, Velocity,
};
use tracker::message::{comm_b_reply, squitter};
use tracker::position::{Position, bearing_of, signed_bearing, toward};
use tracker::proto::{
    Advisory, EmergencyPriorityStatus, EmitterCategory, Modes,
    advisory::{Resolution, Threat},
};
use tracker::register::{HeadingAndSpeed, TrackAndTurn};

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
/// Standard rate of turn, degrees per second: how fast an aircraft turns
/// where that banks it no further than the most.
const TURN_DEG_PER_S: f64 = 3.0;
/// The most an airliner banks in a turn, which sets how fast it turns at speed.
const BANK_MOST_DEG: f64 = 25.0;
const GRAVITY_M_PER_S2: f64 = 9.806_65;
const KNOT_M_PER_S: f64 = 1852.0 / 3600.0;
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
    bearing_of(to_x - from_x, to_y - from_y).0
}

/// How fast an aircraft at the airspeed turns: at the standard rate, or as
/// fast as the most bank turns it in a coordinated turn when that is slower.
fn turn_rate_deg_per_s(true_airspeed_kt: f64) -> f64 {
    let at_most_bank =
        GRAVITY_M_PER_S2 * BANK_MOST_DEG.to_radians().tan() / (true_airspeed_kt * KNOT_M_PER_S);
    at_most_bank.to_degrees().min(TURN_DEG_PER_S)
}

/// The bank of a coordinated turn at the airspeed and the rate, positive to the right.
fn bank_deg(true_airspeed_kt: f64, turn_deg_per_s: f64) -> f64 {
    let centripetal = true_airspeed_kt * KNOT_M_PER_S * turn_deg_per_s.to_radians();
    (centripetal / GRAVITY_M_PER_S2).atan().to_degrees()
}

/// A holding pattern as ICAO Doc 8168 (PANS-OPS) Vol I, Part II, Section 6 (holding procedures)
/// flies a standard one: right turns, and an outbound leg timed one minute at or below 14 000 ft
/// (a minute and a half above), the turns at 3° a second or, where that banks the aircraft more,
/// at 25° of bank. The values are as the PANS-OPS section is restated by `SKYbrary`'s "Holding
/// Pattern" and the AIPs' ENR 1.5.
#[derive(Clone, Copy)]
struct Hold {
    /// The fix, NM east and north of the site.
    x: f64,
    y: f64,
    /// The inbound course, degrees true.
    inbound_deg: f64,
    /// How long the outbound leg is flown, seconds.
    leg_s: f64,
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
    /// The emergency/priority status it broadcasts, when not the one its squawk goes with.
    status: Option<EmergencyPriorityStatus>,
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
    /// What it keeps showing, so that the scope has one to show it on.
    shown: Option<Shown>,
    kind: &'static str,
    /// Beyond this it is put back across the site; the fleet's bounds when 0.
    bounds: f64,
    /// The pattern it flies for good, in place of any route or straight flight.
    hold: Option<Hold>,
    /// The aircraft it keeps its place off, in place of any flight of its own.
    station: Option<Station>,
}

/// Where an aircraft keeps off another, on the same track at the same speed.
#[derive(Clone, Copy)]
struct Station {
    /// The address of the aircraft it keeps its place off.
    leader: u32,
    range_nm: f64,
    /// Degrees right of the leader's track.
    bearing_deg: f64,
    below_ft: f64,
}

const AUTOPILOT: Modes = Modes {
    autopilot: true,
    vnav: false,
    altitude_hold: false,
    approach: false,
    lnav: false,
    tcas: false,
    heard_ms: 0,
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
/// What an aircraft of the fleet keeps showing: it presses IDENT, or it flies
/// a resolution advisory against the aircraft at an address.
#[derive(Clone, Copy, PartialEq)]
enum Shown {
    Ident,
    Advisory(u32),
}

/// A corrective climb against the threat at `address`.
fn climbing(address: u32) -> Advisory {
    Advisory {
        multiple_threats: false,
        resolution: Some(Resolution {
            corrective: true,
            downward: false,
            increased_rate: false,
            sense_reversal: false,
            altitude_crossing: false,
            positive: true,
        }),
        corrections: None,
        terminated: false,
        threat: Some(Threat::ThreatAddress(address)),
        heard_ms: 0,
    }
}

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
        Plan { sel_alt: Some(4000.0), sel_heading: Some(210.0), modes: Some(AUTOPILOT), shown: Some(Shown::Ident),
            ..plan(2, true, large, 0o1724, (17.0, 22.0), 9000.0, 270.0, 210.0, -1000.0, "B738") },
        Plan { sel_alt: Some(7000.0), modes: Some(MANAGED),
            hold: Some(Hold { x: 5.0, y: 7.0, inbound_deg: 270.0, leg_s: 60.0 }),
            ..plan(3, true, large, 0o2106, (5.0, 7.0), 5000.0, 220.0, 90.0, 1500.0, "B738") },
        plan(4, true, large, 0o4421, (-13.0, -26.0), 8000.0, 260.0, 25.0, -800.0, "B738"),
        Plan { mlat: true,
            ..plan(5, false, light, 0o1200, (-13.0, -11.0), 2500.0, 95.0, 0.0, 0.0, "C172") },
        Plan { sel_alt: Some(14_000.0), modes: Some(Modes { lnav: true, ..HOLDING }),
            hold: Some(Hold { x: 12.0, y: 14.0, inbound_deg: 225.0, leg_s: 60.0 }),
            ..plan(6, true, large, 0o3452, (14.71, 16.71), 14_000.0, 230.0, 225.0, 0.0, "A320") },
        Plan { sel_alt: Some(21_000.0), sel_heading: Some(260.0), modes: Some(HOLDING), shown: Some(Shown::Advisory(0x00d0_000e)),
            ..plan(7, true, heavy, 0o5512, (-8.0, 31.0), 17_000.0, 380.0, 260.0, 0.0, "B74F") },
        plan(8, true, large, 0o7012, (32.0, 7.0), 7500.0, 240.0, 250.0, -600.0, "CRJ7"),
        plan(9, false, small, 0o7700, (-28.0, 10.0), 9000.0, 250.0, 95.0, -1200.0, "C68A"),
        Plan { ground: true,
            ..plan(10, true, large, 0o2201, (0.6, -0.4), 0.0, 18.0, 340.0, 0.0, "A321") },
        Plan { ground: true,
            ..plan(11, true, heavy, 0o3112, (-0.5, 0.3), 0.0, 6.0, 160.0, 0.0, "B773") },
        Plan { status: Some(EmergencyPriorityStatus::MinimumFuel),
            ..plan(12, true, large, 0o2253, (-22.0, -18.0), 12_000.0, 280.0, 300.0, 1500.0, "A320") },
        Plan { status: Some(EmergencyPriorityStatus::GeneralEmergency),
            ..plan(13, true, large, 0o3305, (24.0, -12.0), 6000.0, 230.0, 320.0, -900.0, "B738") },
        Plan { station: Some(Station { leader: 0x00d0_0007, range_nm: 2.5, bearing_deg: 33.0, below_ft: 500.0 }),
            ..plan(14, true, large, 0o2214, (0.0, 0.0), 16_500.0, 380.0, 260.0, 0.0, "A320") },
    ]
}

/// A generic airliner, its address `number` on from `block`.
fn generic(block: u32, number: u32, kind: &'static str) -> Plan {
    Plan {
        address: block + number,
        number,
        digits: 4,
        callsign: true,
        category: EmitterCategory::A3Large,
        squawk: 0o1000 + number % 0o6000,
        kind,
        ..Plan::default()
    }
}

/// An arrival of a scenario, numbered on from the streams before it.
fn arrival(number: u32) -> Plan {
    let kind = if number.is_multiple_of(2) {
        "A320"
    } else {
        "B738"
    };
    generic(0x00d2_0000, number, kind)
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
            let (x, y) = toward(random() * 360.0, range);
            Plan {
                x,
                y,
                alt: 1000.0 * (levels.0 + random() * levels.1).round(),
                gs: (speeds.0 + random() * speeds.1).round(),
                track: (random() * 360.0).round(),
                ..plan(number)
            }
        })
        .collect()
}

/// The most extra targets the sim flies: far beyond a real receiver's traffic,
/// which is what a load test wants; every target is built up front, and more
/// would also run their addresses out of the block reserved for them.
pub const MOST_EXTRA: u32 = 10_000;

/// `count` generic en-route targets spread over the area, for load testing.
fn extra_fleet(count: u32) -> Vec<Plan> {
    scattered(
        &mut mulberry32(count),
        0..count,
        50.0,
        (3.0, 35.0),
        (180.0, 300.0),
        |number| generic(0x00d1_0000, number, "A320"),
    )
}

/// Where a holding aircraft is in its pattern.
#[derive(Clone, Copy, Debug, PartialEq)]
enum Phase {
    /// Flying in to the fix.
    Inbound,
    /// Turning right from the inbound course to its reciprocal.
    TurningOut,
    /// Flying away from the fix, wings level, for the seconds left.
    Outbound { left_s: f64 },
    /// Turning right from the reciprocal back to the inbound course.
    TurningIn,
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
    /// Whether it has reached the end of its route.
    landed: bool,
    /// Where it is in its holding pattern, when it flies one.
    holding: Phase,
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
            holding: Phase::Inbound,
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

    /// The most it can turn in `elapsed` seconds at its airspeed through the wind, degrees.
    fn most_turn_deg(&self, elapsed: f64) -> f64 {
        let (_, airspeed) = air::through_air(self.plan.track, self.plan.gs, WIND);
        turn_rate_deg_per_s(airspeed) * elapsed
    }

    /// Turns its track by `turn` degrees, right positive, over `elapsed` seconds, at the rate that is.
    fn turn_by(&mut self, turn: f64, elapsed: f64) {
        self.plan.track = (self.plan.track + turn).rem_euclid(360.0);
        self.turning = if elapsed > 0.0 { turn / elapsed } else { 0.0 };
    }

    /// Turns the short way toward the point as fast as its speed allows, in `elapsed` seconds.
    fn steer_toward(&mut self, x: f64, y: f64, elapsed: f64) {
        let wanted = bearing(self.x, self.y, x, y);
        let off = signed_bearing(wanted - self.plan.track);
        let most = self.most_turn_deg(elapsed);
        self.turn_by(off.clamp(-most, most), elapsed);
    }

    /// Turns toward the leg's waypoint as fast as its speed allows, flies at the speed of the
    /// one it left, and climbs or descends so as to be at its level there; past the last
    /// waypoint it starts over.
    fn follow(&mut self, route: &Route, elapsed: f64) {
        let Some(target) = route.get(self.leg) else {
            return;
        };
        self.plan.gs = route.get(self.leg - 1).map_or(target.gs, |from| from.gs);
        let to_go = (target.x - self.x).hypot(target.y - self.y);
        self.steer_toward(target.x, target.y, elapsed);
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
        let (east, north) = toward(self.plan.track, distance);
        self.x += east;
        self.y += north;
        distance
    }

    /// Flies the next `elapsed` seconds of the hold: in to the fix, then right round to the
    /// reciprocal, out wings level for the leg's time, and right round to the inbound course.
    fn hold_for(&mut self, hold: Hold, elapsed: f64) {
        match self.holding {
            Phase::Inbound => {
                let to_go = (hold.x - self.x).hypot(hold.y - self.y);
                self.steer_toward(hold.x, hold.y, elapsed);
                let distance = self.fly_straight(elapsed);
                if to_go <= AT_NM.max(distance) {
                    self.holding = Phase::TurningOut;
                }
            }
            Phase::TurningOut => {
                let outbound = Phase::Outbound { left_s: hold.leg_s };
                self.turn_right_to(hold.inbound_deg + 180.0, elapsed, outbound);
            }
            Phase::Outbound { left_s } => {
                self.turn_by(0.0, elapsed);
                self.fly_straight(elapsed);
                let left_s = left_s - elapsed;
                self.holding = if left_s > 0.0 {
                    Phase::Outbound { left_s }
                } else {
                    Phase::TurningIn
                };
            }
            Phase::TurningIn => self.turn_right_to(hold.inbound_deg, elapsed, Phase::Inbound),
        }
    }

    /// The most it turns in `elapsed` seconds in a hold: at the rate for the highest airspeed
    /// the wind can give it, so that it never banks beyond the most. The rate is the same on
    /// every heading, as the turn out and the turn in must be equal for the pattern to close.
    fn hold_turn_deg(&self, elapsed: f64) -> f64 {
        turn_rate_deg_per_s(self.plan.gs + WIND.speed_kt) * elapsed
    }

    /// Turns right toward the course at the hold's rate of turn, and goes on to `next` in the
    /// step that completes the turn.
    fn turn_right_to(&mut self, course_deg: f64, elapsed: f64, next: Phase) {
        let remaining = (course_deg - self.plan.track).rem_euclid(360.0);
        let turn = self.hold_turn_deg(elapsed).min(remaining);
        self.turn_by(turn, elapsed);
        self.fly_straight(elapsed);
        if turn >= remaining {
            self.holding = next;
        }
    }

    fn advance(&mut self, now: f64, elapsed: f64) {
        if self.plan.station.is_some() {
            return;
        }
        if let Some(route) = self.route.clone() {
            self.follow(&route, elapsed);
            return;
        }
        if let Some(hold) = self.plan.hold {
            self.hold_for(hold, elapsed);
            self.fly_level(now, elapsed);
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
    /// every second, a set emergency/priority status every second too (DO-260B
    /// has it every 0.7 to 0.9 s), and the rest at the longer periods of DO-260B.
    fn broadcasts(&self, site: Position, second: u64) -> Vec<Bits> {
        let plan = &self.plan;
        let odd = !second.is_multiple_of(2);
        let mut fields = self.moving(site, odd);
        fields.extend(self.selected().map(|selected| selected.write()));
        if let Some(Shown::Advisory(threat)) = plan.shown {
            fields.push(
                RaBroadcast {
                    advisory: climbing(threat),
                }
                .write(),
            );
        }
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
        let emergency_priority_status = plan.status.unwrap_or_else(|| emergency(plan.squawk));
        let set = emergency_priority_status != EmergencyPriorityStatus::NoEmergency;
        if set || second.is_multiple_of(5) {
            let status = Status {
                emergency_priority_status,
                mode_a_code: Some(plan.squawk),
            };
            fields.push(status.write());
        }
        if second.is_multiple_of(5) {
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
        // The plane is laid on the globe as bearings and distances from the site.
        let (bearing_deg, distance_nm) = bearing_of(self.x, self.y);
        let at = site.ahead(bearing_deg, distance_nm);
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
            magnetic_heading_deg: None,
            baro_vertical_rate_fpm: Some(whole(self.baro_rate)),
            geometric_vertical_rate_fpm: None,
            geometric_minus_baro_ft: None,
        };
        vec![position.write(), velocity.write()]
    }

    /// The modes it reports: the plan's, with altitude hold also engaged while it flies level with a
    /// level selected.
    #[allow(clippy::float_cmp)]
    fn modes(&self) -> Option<Modes> {
        let level = self.baro_rate == 0.0 && self.sel_alt.is_some();
        self.plan.modes.map(|modes| Modes {
            altitude_hold: modes.altitude_hold || level,
            ..modes
        })
    }

    /// What is selected on the autopilot, when the aircraft reports any of it.
    fn selected(&self) -> Option<TargetStateAndStatus> {
        let plan = &self.plan;
        let target = TargetState {
            selected_altitude_mcp_ft: self.sel_alt.map(whole),
            selected_altitude_fms_ft: None,
            selected_heading_deg: plan.sel_heading,
            baro_setting_hpa: self.sel_alt.map(|_| 1013.6),
            modes: self.modes().map(ModesReported::from).unwrap_or_default(),
        };
        let reports = target != TargetState::default();
        reports.then_some(TargetStateAndStatus {
            target,
            nac_p: NAC_P,
        })
    }

    /// What it answers to a radar's interrogations in the air: the track and
    /// turn report and the heading and speed report, flying through the
    /// standard air in the wind, banked as its turn needs, the heading as
    /// magnetic by the declination.
    fn answers(&self, declination_deg: f64) -> Vec<Bits> {
        let plan = &self.plan;
        if plan.ground {
            return vec![];
        }
        let (heading, airspeed) = air::through_air(plan.track, plan.gs, WIND);
        let mach = air::mach(airspeed, self.alt);
        let track_and_turn = TrackAndTurn {
            roll_deg: Some(bank_deg(airspeed, self.turning)),
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
        let mut fleet = Self {
            site,
            clock: Box::new(clock),
            started: now,
            last: now,
            flown: 0,
            flying,
        };
        fleet.keep_stations();
        fleet
    }

    /// Puts each aircraft that keeps a station where it is off its leader, flying as it flies.
    fn keep_stations(&mut self) {
        for i in 0..self.flying.len() {
            let Some(station) = self.flying[i].plan.station else {
                continue;
            };
            let Some(leader) = self
                .flying
                .iter()
                .find(|other| other.plan.address == station.leader)
            else {
                continue;
            };
            let (east, north) = toward(leader.plan.track + station.bearing_deg, station.range_nm);
            let (x, y) = (leader.x + east, leader.y + north);
            let (alt, track, gs) = (
                leader.alt - station.below_ft,
                leader.plan.track,
                leader.plan.gs,
            );
            let (baro_rate, turning) = (leader.baro_rate, leader.turning);
            let follower = &mut self.flying[i];
            (follower.x, follower.y, follower.alt) = (x, y, alt);
            (follower.plan.track, follower.plan.gs) = (track, gs);
            (follower.baro_rate, follower.turning) = (baro_rate, turning);
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
        let declination = self.site.declination_deg(now);
        let mut frames = Vec::new();
        for flying in &mut self.flying {
            flying.advance(now, elapsed);
        }
        self.keep_stations();
        for flying in &self.flying {
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
                heard(&comm_b_reply(
                    address,
                    Some(whole(flying.alt)),
                    flying.plan.shown == Some(Shown::Ident),
                    mb,
                ));
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
    use super::{Fleet, Flying, MANAGED, Phase, Plan, fleet as planned, turn_rate_deg_per_s};
    use crate::testing::{SITE, hand_clock};
    use tracker::field::{Field, ModesReported, RaBroadcast, Status};
    use tracker::position::{bearing_of, signed_bearing};
    use tracker::proto::{EmergencyPriorityStatus, advisory::Threat};
    use tracker::register::TrackAndTurn;

    /// A fleet at second 1000 and the hand that moves its clock.
    fn fleet(extra: u32) -> (Fleet, impl Fn(f64)) {
        let (clock, hand) = hand_clock(1000.0);
        (Fleet::new(SITE, clock, extra), hand)
    }

    #[test]
    fn aircraft_turns_at_the_standard_rate_when_slow_and_at_the_most_bank_when_fast() {
        // Arrange: on final, and en route
        let airspeeds = [140.0, 300.0];

        // Act
        let rates = airspeeds.map(turn_rate_deg_per_s);

        // Assert: 25° of bank at 300 kt turns 1.7° a second
        assert!((rates[0] - 3.0).abs() < 1e-9, "{rates:?}");
        assert!((rates[1] - 1.7).abs() < 0.01, "{rates:?}");
    }

    #[test]
    fn turning_aircraft_answers_with_the_bank_of_a_coordinated_turn() {
        // Arrange: east at 200 kt, 165 kt through the air in the fleet's wind,
        // turning right and left at the standard rate
        let plan = Plan {
            gs: 200.0,
            track: 90.0,
            alt: 5000.0,
            ..Plan::default()
        };
        let turning = [3.0, -3.0].map(|rate| {
            let mut flying = Flying::new(plan, 0.0);
            flying.turning = rate;
            flying
        });

        // Act
        let answered = turning.map(|flying| TrackAndTurn::read(flying.answers(0.0)[0]));

        // Assert: 24.4° either way, to the step of the field
        let rolls = answered.map(|report| report.and_then(|report| report.roll_deg));
        let near = |roll: Option<f64>, expected: f64| {
            roll.is_some_and(|roll| (roll - expected).abs() < 0.2)
        };
        assert!(near(rolls[0], 24.4) && near(rolls[1], -24.4), "{rolls:?}");
    }

    /// The modes an aircraft with this plan reports at the start.
    fn reported_modes(plan: Plan) -> ModesReported {
        let selected = Flying::new(plan, 0.0).selected();
        selected.expect("the plan selects a level").target.modes
    }

    /// An aircraft at 7000 ft with 7000 ft selected, on managed modes, climbing at `baro_rate`.
    fn selected_plan(baro_rate: f64) -> Plan {
        Plan {
            alt: 7000.0,
            baro_rate,
            sel_alt: Some(7000.0),
            modes: Some(MANAGED),
            ..Plan::default()
        }
    }

    #[test]
    fn aircraft_level_at_its_selected_level_on_the_autopilot_reports_altitude_hold() {
        // Arrange
        let plan = selected_plan(0.0);

        // Act
        let modes = reported_modes(plan);

        // Assert
        assert_eq!(modes.altitude_hold, Some(true));
        assert_eq!(modes.vnav, Some(true));
    }

    #[test]
    fn aircraft_climbing_on_the_autopilot_does_not_report_altitude_hold() {
        // Arrange
        let plan = selected_plan(1500.0);

        // Act
        let modes = reported_modes(plan);

        // Assert
        assert_eq!(modes.altitude_hold, Some(false));
    }

    #[test]
    fn aircraft_with_no_modes_reports_none_even_when_level() {
        // Arrange
        let plan = Plan {
            modes: None,
            ..selected_plan(0.0)
        };

        // Act
        let modes = reported_modes(plan);

        // Assert
        assert_eq!(modes, ModesReported::default());
    }

    /// TEST06's fix, NM east and north of the site.
    const HOLD_FIX: (f64, f64) = (12.0, 14.0);

    /// What the hold's aircraft is doing at the end of one second.
    struct Step {
        x: f64,
        y: f64,
        track: f64,
        turning: f64,
        alt: f64,
        baro_rate: f64,
        roll: f64,
        phase: Phase,
    }

    /// The fleet's aircraft numbered `number` flown from its start for `seconds`, one second at a time.
    fn hold_flown(number: u32, seconds: u32) -> Vec<Step> {
        let plan = planned()
            .into_iter()
            .find(|plan| plan.number == number)
            .expect("the aircraft is in the fleet");
        let mut flying = Flying::new(plan, 0.0);
        (0..seconds)
            .map(|second| {
                flying.advance(f64::from(second), 1.0);
                let report = TrackAndTurn::read(flying.answers(0.0)[0]);
                Step {
                    x: flying.x,
                    y: flying.y,
                    track: flying.plan.track,
                    turning: flying.turning,
                    alt: flying.alt,
                    baro_rate: flying.baro_rate,
                    roll: report
                        .and_then(|report| report.roll_deg)
                        .unwrap_or(f64::NAN),
                    phase: flying.holding,
                }
            })
            .collect()
    }

    /// The indices at which a step is the first of a run of steps of the phase.
    fn entered(steps: &[Step], phase: fn(&Phase) -> bool) -> Vec<usize> {
        (0..steps.len())
            .filter(|&i| phase(&steps[i].phase) && (i == 0 || !phase(&steps[i - 1].phase)))
            .collect()
    }

    #[test]
    fn holding_aircraft_comes_back_over_its_fix_having_turned_right_through_360() {
        // Arrange: twenty minutes, about four patterns
        let minutes = 20;

        // Act
        let steps = hold_flown(6, minutes * 60);

        // Assert: between two passes of the fix, which start its turn out, it turned a full
        // circle to the right, and each pass is on the inbound course
        let passes = entered(&steps, |phase| matches!(phase, Phase::TurningOut));
        assert!(passes.len() >= 3, "{passes:?}");
        for pair in passes.windows(2) {
            let turned: f64 = steps[pair[0]..pair[1]]
                .iter()
                .map(|step| step.turning)
                .sum();
            assert!((turned - 360.0).abs() < 5.0, "{turned}");
        }
        for &pass in &passes {
            let off = (steps[pass].track - 225.0 + 540.0).rem_euclid(360.0) - 180.0;
            assert!(off.abs() < 10.0, "{off}");
        }
    }

    #[test]
    fn holding_aircraft_stays_near_its_fix_at_its_level() {
        // Arrange: half an hour
        let minutes = 30;

        // Act
        let steps = hold_flown(6, minutes * 60);

        // Assert
        let far = steps
            .iter()
            .map(|step| (step.x - HOLD_FIX.0).hypot(step.y - HOLD_FIX.1))
            .fold(0.0, f64::max);
        assert!(far < 8.0, "{far}");
        assert!(steps.iter().all(|step| (step.alt - 14_000.0).abs() < 1e-9));
        assert!(steps.iter().all(|step| step.baro_rate.abs() < 1e-9));
    }

    #[test]
    fn aircraft_in_a_hold_turns_while_it_climbs_and_stays_near_its_fix() {
        // Arrange: TEST03 holds at its fix and climbs from 5 000 to 7 000 ft; five minutes
        let seconds = 300;

        // Act
        let steps = hold_flown(3, seconds);

        // Assert: it banked more than 15° in a step in which it climbed, reached its level,
        // and kept within a few miles of its fix
        let climbing_in_a_turn = steps
            .iter()
            .any(|step| step.baro_rate > 0.0 && step.roll.abs() > 15.0);
        let highest = steps.iter().map(|step| step.alt).fold(0.0, f64::max);
        let far = steps
            .iter()
            .map(|step| (step.x - 5.0).hypot(step.y - 7.0))
            .fold(0.0, f64::max);
        assert!(climbing_in_a_turn);
        assert!((highest - 7000.0).abs() < 1e-9, "{highest}");
        assert!(far < 8.0, "{far}");
    }

    #[test]
    fn holding_aircraft_banks_right_in_its_turns_and_flies_wings_level_outbound() {
        // Arrange: two patterns
        let minutes = 10;

        // Act
        let steps = hold_flown(6, minutes * 60);

        // Assert
        let turning_phase = |phase: Phase| matches!(phase, Phase::TurningOut | Phase::TurningIn);
        let turns: Vec<_> = (1..steps.len())
            .filter(|&i| turning_phase(steps[i].phase) && steps[i - 1].phase == steps[i].phase)
            .map(|i| &steps[i])
            .collect();
        let outbound: Vec<_> = steps
            .iter()
            .filter(|step| {
                matches!(step.phase, Phase::Outbound { .. }) && step.turning.abs() < 1e-9
            })
            .collect();
        assert!(!turns.is_empty() && !outbound.is_empty());
        assert!(turns.iter().all(|step| (15.0..=25.5).contains(&step.roll)));
        assert!(outbound.iter().all(|step| step.roll.abs() < 0.5));
        assert!(steps.iter().all(|step| step.roll > -5.0));
    }

    #[test]
    fn holding_aircraft_flies_its_outbound_leg_for_a_minute() {
        // Arrange: four patterns
        let minutes = 20;

        // Act
        let steps = hold_flown(6, minutes * 60);

        // Assert: each leg, from its first second to its last, is a minute long
        let outbound = |phase: &Phase| matches!(phase, Phase::Outbound { .. });
        let legs: Vec<usize> = entered(&steps, outbound)
            .into_iter()
            .map(|start| {
                steps[start..]
                    .iter()
                    .take_while(|step| outbound(&step.phase))
                    .count()
            })
            .collect();
        assert!(legs.len() >= 3, "{legs:?}");
        assert!(
            legs.iter().all(|&seconds| (59..=61).contains(&seconds)),
            "{legs:?}"
        );
    }

    #[test]
    fn a_set_status_is_broadcast_every_second_and_none_every_five() {
        // Arrange: one with minimum fuel, one with no status set
        let flying = [Some(EmergencyPriorityStatus::MinimumFuel), None].map(|status| {
            let plan = Plan {
                status,
                squawk: 0o2253,
                ..Plan::default()
            };
            Flying::new(plan, 0.0)
        });

        // Act
        let broadcast = flying.map(|aircraft| {
            (1..=5)
                .filter(|&second| {
                    let fields = aircraft.broadcasts(SITE, second);
                    fields.into_iter().any(|bits| Status::read(bits).is_some())
                })
                .count()
        });

        // Assert
        assert_eq!(broadcast, [5, 1]);
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
        assert_eq!(registered.len(), 14 + 50);
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

    /// The address of the aircraft numbered `number` in the fleet.
    fn address_of(number: u32) -> u32 {
        planned()
            .into_iter()
            .find(|plan| plan.number == number)
            .map(|plan| plan.address)
            .expect("the aircraft is in the fleet")
    }

    #[test]
    fn advisory_names_a_simulated_target_by_its_address() {
        // Arrange
        let plan = planned()
            .into_iter()
            .find(|plan| plan.number == 7)
            .expect("TEST07 is in the fleet");
        let flying = Flying::new(plan, 0.0);

        // Act
        let advisory = flying
            .broadcasts(SITE, 0)
            .into_iter()
            .find_map(RaBroadcast::read)
            .map(|broadcast| broadcast.advisory);

        // Assert
        let threat = advisory.and_then(|advisory| advisory.threat);
        let addresses: Vec<_> = planned().iter().map(|plan| plan.address).collect();
        assert!(
            matches!(threat, Some(Threat::ThreatAddress(address)) if addresses.contains(&address)),
            "{threat:?}"
        );
    }

    #[test]
    fn threat_keeps_its_station_off_the_advisory_aircraft() {
        // Arrange: twenty minutes, long enough for TEST07 to be put back across the site
        let (leader, threat) = (address_of(7), address_of(14));
        let (mut fleet, advance) = fleet(0);
        let mut seconds = Vec::new();

        // Act
        for _ in 0..1200 {
            fleet.fly();
            let at = |address| fleet.states().find(|state| state.address == address);
            seconds.push((at(leader), at(threat)));
            advance(1.0);
        }

        // Assert: every second the threat is 2.5 NM off, 33° right of the track, 500 ft below,
        // on the same track at the same speed, and TEST07 was indeed put back across the site
        let pairs: Vec<_> = seconds
            .into_iter()
            .map(|(l, t)| (l.unwrap(), t.unwrap()))
            .collect();
        let jumped = pairs
            .windows(2)
            .any(|w| (w[1].0.x - w[0].0.x).hypot(w[1].0.y - w[0].0.y) > 10.0);
        assert!(jumped, "TEST07 never left the bounds");
        for (l, t) in &pairs {
            let (bearing, range) = bearing_of(t.x - l.x, t.y - l.y);
            assert!((range - 2.5).abs() < 0.05, "{range}");
            assert!(
                (signed_bearing(bearing - l.track_deg) - 33.0).abs() < 1.0,
                "{bearing}"
            );
            assert!(
                (l.alt_ft - t.alt_ft - 500.0).abs() < 1.0,
                "{} {}",
                l.alt_ft,
                t.alt_ft
            );
            assert!((t.track_deg - l.track_deg).abs() < 1e-9 && (t.gs_kt - l.gs_kt).abs() < 1e-9);
        }
    }
}
