//! The aircraft a receiver hears, kept from one message to the next.

use std::collections::btree_map::Entry;
use std::collections::{BTreeMap, VecDeque};

use crate::air::{self, Wind};
use crate::beast::{Frame, Observation};
use crate::cpr::{self, Cpr};
use crate::field::{
    Airspeed, Identification, Integrity, TargetState, TargetStateAndStatus, TargetSteps, Velocity,
};
use crate::message::{Report, Trust};
use crate::position::Position;
use crate::proto::{
    self, Address, Advisory, Aircraft, Emergency, EmergencyPriorityStatus, EmitterCategory, Flag,
    Int, Modes, Real, Reception, Snapshot, Source, ms,
};
use crate::register::{
    BEARING_STEP_DEG, HeadingAndSpeed, Known, Register, SelectedVerticalIntention, TrackAndTurn,
};

/// readsb lists an aircraft from its second message on: a single one may be
/// noise that passes for a message.
const MESSAGES_TO_BE_LISTED: u64 = 2;
/// The messages whose power the signal of an aircraft is the mean of, as in readsb.
const POWERS_KEPT: usize = 8;

/// A position of each format gives a place when the two are no further apart (DO-260B).
const PAIR_WITHIN_S: f64 = 10.0;
/// How long readsb keeps what is no longer said, and lists an aircraft that is
/// no longer heard. A fix lapses with the rest, long before the aircraft could
/// have flown the 180 NM within which a lone position is placed by it.
const LAPSE_S: f64 = 60.0;
/// A callsign and a category are kept longer: they stay true of the flight
/// while they are not said.
const IDENTIFICATION_LAPSE_S: f64 = 15.0 * 60.0;
/// Further than any receiver hears, so a position beyond is a wrong one; readsb's default.
const MAX_RANGE_NM: f64 = 300.0;
/// Values read together, to tell a register apart or to derive the wind, are
/// taken within this of one another: a radar sweep or two, in which an
/// airliner changes little.
const RELATED_S: f64 = 15.0;
/// The ground vector and the air vector a wind is derived from, and the
/// heading and the airspeed of the latter, are taken within this of one
/// another: a radar asks for the registers in one sweep, so values further
/// apart are of different sweeps, between which the aircraft may have turned.
const WIND_WITHIN_S: f64 = 3.0;
/// An aircraft turning faster than this makes no wind: its heading and its
/// track are not of one instant.
const STRAIGHT_DEG_PER_S: f64 = 0.5;

/// Every aircraft heard, by the kind of its address and the address.
pub struct Traffic {
    site: Position,
    aircraft: BTreeMap<(i32, u32), Tracked>,
    /// What is still kept of the aircraft forgotten, for when they are heard again.
    remembered: BTreeMap<(i32, u32), Remembered>,
    messages: u64,
}

impl Traffic {
    /// Nothing heard yet by the receiver at the site.
    #[must_use]
    pub fn new(site: Position) -> Self {
        Self {
            site,
            aircraft: BTreeMap::new(),
            remembered: BTreeMap::new(),
            messages: 0,
        }
    }

    /// Takes in what the messages of the frames heard at `now_s`, in seconds
    /// since the epoch, say; a damaged one says nothing.
    pub fn hear(&mut self, frames: &[Frame], now_s: f64) {
        for observation in frames.iter().filter_map(Frame::observation) {
            self.take(&observation, now_s);
        }
    }

    /// Takes in what a message heard at `now_s` says.
    ///
    /// An address that is only recovered is believed of an aircraft already
    /// known; of any other, the message is taken for a damaged one.
    fn take(&mut self, observation: &Observation, now_s: f64) {
        let Address { value, r#type } = observation.address;
        let key = (r#type, value);
        let tracked = match (self.aircraft.entry(key), observation.trust) {
            (Entry::Occupied(known), _) => known.into_mut(),
            (Entry::Vacant(unknown), Trust::Announced) => unknown.insert(Tracked {
                address: observation.address,
                remembered: self.remembered.remove(&key).unwrap_or_default(),
                ..Tracked::default()
            }),
            (Entry::Vacant(_), Trust::Recovered) => return,
        };
        self.messages += 1;
        tracked.hear(observation, now_s, self.site);
    }

    /// The aircraft as they are known at `now_s`, in the order of their
    /// addresses. Those no longer heard are forgotten, but for what is
    /// remembered of them.
    pub fn snapshot(&mut self, now_s: f64) -> Snapshot {
        let forgotten = self
            .aircraft
            .extract_if(.., |_, tracked| now_s - tracked.seen_s >= LAPSE_S);
        self.remembered
            .extend(forgotten.map(|(key, tracked)| (key, tracked.remembered)));
        self.remembered
            .retain(|_, remembered| remembered.at(now_s).is_some());
        let listed = self
            .aircraft
            .values()
            .filter(|tracked| tracked.messages >= MESSAGES_TO_BE_LISTED);
        Snapshot {
            now_ms: ms(now_s),
            messages: self.messages,
            aircraft: listed.map(|tracked| tracked.at(now_s)).collect(),
        }
    }
}

/// Something said, when it was heard, in seconds since the epoch, and the
/// step its report comes in, zero when exact. A value derived from others
/// is heard when the oldest of them was.
#[derive(Clone, Copy)]
struct Heard<T> {
    said: T,
    at_s: f64,
    step: f64,
}

/// What was heard, without when.
fn said<T>(heard: Heard<T>) -> T {
    heard.said
}

/// Something derived, heard when the oldest of what it is derived from was.
fn derived<T>(said: T, at_s: f64) -> Heard<T> {
    Heard {
        said,
        at_s,
        step: 0.0,
    }
}

impl<T> Heard<T> {
    /// Something else made of what was heard, heard at the same instant.
    fn map<U>(self, into: impl FnOnce(T) -> U) -> Heard<U> {
        Heard {
            said: into(self.said),
            at_s: self.at_s,
            step: self.step,
        }
    }

    /// As the feed carries an integer; none of one that does not fit.
    fn int(self) -> Option<Int>
    where
        T: TryInto<i32>,
    {
        Some(Int {
            value: self.said.try_into().ok()?,
            heard_ms: ms(self.at_s),
        })
    }
}

impl Heard<f64> {
    /// As the feed carries a real number.
    fn real(self) -> Real {
        Real {
            value: self.said,
            heard_ms: ms(self.at_s),
        }
    }
}

impl Heard<bool> {
    /// As the feed carries a flag.
    fn flag(self) -> Flag {
        Flag {
            value: self.said,
            heard_ms: ms(self.at_s),
        }
    }
}

/// The newest report of a value, however it was heard, unless a finer one
/// came within a sweep or two: a coarser one would only jitter it.
struct Said<T> {
    kept: Option<Heard<T>>,
}

impl<T> Default for Said<T> {
    fn default() -> Self {
        Self { kept: None }
    }
}

impl<T: Clone> Said<T> {
    /// Takes what a message heard at `now_s` says exactly, when it says it.
    fn keep(&mut self, said: Option<T>, now_s: f64) {
        self.keep_in_steps(said, 0.0, now_s);
    }

    /// Takes what a message heard at `now_s` says in steps of `step`, when
    /// it says it.
    fn keep_in_steps(&mut self, said: Option<T>, step: f64, now_s: f64) {
        self.keep_heard(said.map(|said| Heard {
            said,
            at_s: now_s,
            step,
        }));
    }

    /// Takes what was heard, when there is something, in place of what was
    /// kept: unless that is finer and of the last sweep or two.
    fn keep_heard(&mut self, heard: Option<Heard<T>>) {
        let Some(heard) = heard else {
            return;
        };
        let finer_lately = self
            .kept
            .as_ref()
            .is_some_and(|kept| kept.step < heard.step && heard.at_s - kept.at_s < RELATED_S);
        if !finer_lately {
            self.kept = Some(heard);
        }
    }

    /// What was said, and when, unless it has lapsed by `now_s`.
    fn at(&self, now_s: f64) -> Option<Heard<T>> {
        self.within(LAPSE_S, now_s)
    }

    /// What was said lately, and when: within the seconds of each other that
    /// values read together are taken from.
    fn lately(&self, now_s: f64) -> Option<Heard<T>> {
        self.within(RELATED_S, now_s)
    }

    /// What was said less than `lapse_s` before `now_s`, and when.
    fn within(&self, lapse_s: f64, now_s: f64) -> Option<Heard<T>> {
        self.lasting(lapse_s, now_s).cloned()
    }

    fn lasting(&self, lapse_s: f64, now_s: f64) -> Option<&Heard<T>> {
        self.kept
            .as_ref()
            .filter(|heard| now_s - heard.at_s < lapse_s)
    }
}

/// Where an aircraft was placed, and how well.
#[derive(Clone, Copy)]
struct Fix {
    position: Position,
    integrity: Integrity,
    source: Source,
}

/// What is kept of an aircraft longer than the rest, and when it is forgotten.
#[derive(Default)]
struct Remembered {
    callsign: Said<String>,
    emitter_category: Said<EmitterCategory>,
}

impl Remembered {
    /// Takes what an identification message heard at `now_s` says.
    fn keep(&mut self, said: &Identification, now_s: f64) {
        self.callsign.keep(said.identification.clone(), now_s);
        self.emitter_category
            .keep(Some(said.emitter_category), now_s);
    }

    /// The callsign and the category, each unless it has lapsed by `now_s`,
    /// heard when the later of them was; none once both have lapsed.
    fn at(&self, now_s: f64) -> Option<proto::Identification> {
        let callsign = self.callsign.within(IDENTIFICATION_LAPSE_S, now_s);
        let category = self.emitter_category.within(IDENTIFICATION_LAPSE_S, now_s);
        let latest = [
            callsign.as_ref().map(|heard| heard.at_s),
            category.map(|heard| heard.at_s),
        ]
        .into_iter()
        .flatten()
        .reduce(f64::max)?;
        Some(proto::Identification {
            callsign: callsign.map(said),
            emitter_category: category.map(|heard| heard.said.into()),
            heard_ms: ms(latest),
        })
    }
}

/// The target state, each field and each mode as it was last said: the
/// broadcast and the reply each leave out what the other says.
#[derive(Default)]
struct Target {
    selected_altitude_mcp_ft: Said<i32>,
    selected_altitude_fms_ft: Said<i32>,
    selected_heading_deg: Said<f64>,
    baro_setting_hpa: Said<f64>,
    autopilot: Said<bool>,
    vnav: Said<bool>,
    altitude_hold: Said<bool>,
    approach: Said<bool>,
    lnav: Said<bool>,
    tcas: Said<bool>,
}

impl Target {
    /// Takes what a message heard at `now_s` says of each field, the
    /// altitudes and the setting in the steps the message comes in.
    fn keep(&mut self, said: &TargetState, steps: TargetSteps, now_s: f64) {
        self.selected_altitude_mcp_ft.keep_in_steps(
            said.selected_altitude_mcp_ft,
            steps.altitude_ft,
            now_s,
        );
        self.selected_altitude_fms_ft.keep_in_steps(
            said.selected_altitude_fms_ft,
            steps.altitude_ft,
            now_s,
        );
        self.selected_heading_deg
            .keep(said.selected_heading_deg, now_s);
        self.baro_setting_hpa
            .keep_in_steps(said.baro_setting_hpa, steps.setting_hpa, now_s);
        self.autopilot.keep(said.modes.autopilot, now_s);
        self.vnav.keep(said.modes.vnav, now_s);
        self.altitude_hold.keep(said.modes.altitude_hold, now_s);
        self.approach.keep(said.modes.approach, now_s);
        self.lnav.keep(said.modes.lnav, now_s);
        self.tcas.keep(said.modes.tcas, now_s);
    }

    /// The modes as last said, while any is: heard when the latest was, a
    /// mode that has lapsed as not engaged.
    fn modes(&self, now_s: f64) -> Option<Modes> {
        let said_lately = [
            &self.autopilot,
            &self.vnav,
            &self.altitude_hold,
            &self.approach,
            &self.lnav,
            &self.tcas,
        ]
        .map(|mode| mode.at(now_s));
        let latest = said_lately
            .iter()
            .flatten()
            .map(|heard| heard.at_s)
            .reduce(f64::max)?;
        let [autopilot, vnav, altitude_hold, approach, lnav, tcas] =
            said_lately.map(|mode| mode.is_some_and(said));
        Some(Modes {
            autopilot,
            vnav,
            altitude_hold,
            approach,
            lnav,
            tcas,
            heard_ms: ms(latest),
        })
    }
}

/// One aircraft, as its messages have told of it so far.
#[derive(Default)]
struct Tracked {
    address: Address,
    messages: u64,
    seen_s: f64,
    /// The power of each of the last messages, against full scale.
    powers: VecDeque<f64>,
    remembered: Remembered,
    mode_a_code: Said<u32>,
    ident: Said<bool>,
    emergency_priority_status: Said<EmergencyPriorityStatus>,
    on_ground: Said<bool>,
    baro_altitude_ft: Said<i32>,
    geometric_altitude_ft: Said<i32>,
    geometric_minus_baro_ft: Said<i32>,
    ground_speed_kt: Said<f64>,
    track_deg: Said<f64>,
    baro_vertical_rate_fpm: Said<i32>,
    geometric_vertical_rate_fpm: Said<i32>,
    indicated_airspeed_kt: Said<f64>,
    true_airspeed_kt: Said<f64>,
    target_state: Target,
    advisory: Said<Advisory>,
    nac_p: Said<u32>,
    /// The air data besides, and what they say together.
    magnetic_heading_deg: Said<f64>,
    roll_deg: Said<f64>,
    track_rate_deg_per_s: Said<f64>,
    mach: Said<f64>,
    oat_c: Said<f64>,
    tat_c: Said<f64>,
    wind: Said<Wind>,
    fix: Said<Fix>,
    /// The last position in the air of the even and of the odd format, and when it was heard.
    pairing: [Option<(Cpr, f64)>; 2],
    /// The ADS-B version it broadcasts in, and the NIC supplements it reported.
    version: u32,
    nic_supplement_a: bool,
    nic_supplement_c: bool,
}

impl Tracked {
    fn hear(&mut self, observation: &Observation, now_s: f64, site: Position) {
        self.messages += 1;
        self.seen_s = now_s;
        if let Some(rssi_dbfs) = observation.rssi_dbfs {
            if self.powers.len() == POWERS_KEPT {
                self.powers.pop_front();
            }
            self.powers.push_back(10_f64.powf(rssi_dbfs / 10.0));
        }
        self.take(observation, now_s, site);
    }

    fn take(&mut self, observation: &Observation, now_s: f64, site: Position) {
        match &observation.report {
            Report::AirbornePosition(said) => {
                self.baro_altitude_ft.keep(said.baro_altitude_ft, now_s);
                self.geometric_altitude_ft
                    .keep(said.geometric_altitude_ft, now_s);
                self.on_ground.keep(Some(false), now_s);
                self.qualify(said.nac_p_of_version_0(), now_s);
                let integrity = said.integrity(self.nic_supplement_a, self.version);
                let position = self.airborne(said.cpr, now_s);
                self.place(position, integrity, observation.source, now_s, site);
            }
            Report::SurfacePosition(said) => {
                self.ground_speed_kt.keep(said.ground_speed_kt, now_s);
                self.track_deg.keep(said.track_deg, now_s);
                self.on_ground.keep(Some(true), now_s);
                self.qualify(said.nac_p_of_version_0(), now_s);
                let integrity =
                    said.integrity(self.nic_supplement_a, self.nic_supplement_c, self.version);
                // A receiver hears an aircraft on the ground only from nearby.
                let position = cpr::surface_near(said.cpr, self.whereabouts(now_s, site));
                self.place(position, integrity, observation.source, now_s, site);
            }
            Report::Reply(said) => {
                self.on_ground.keep(said.on_ground, now_s);
                self.baro_altitude_ft.keep(said.baro_altitude_ft, now_s);
                self.mode_a_code.keep(said.mode_a_code, now_s);
                self.ident.keep(said.ident, now_s);
                let register = said
                    .comm_b
                    .and_then(|mb| Register::read(mb, &self.known(now_s)));
                if let Some(register) = register {
                    self.answer(&register, now_s, site);
                }
            }
            Report::Identification(said) => self.remembered.keep(said, now_s),
            Report::Velocity(said) => {
                self.ground_speed_kt
                    .keep_in_steps(said.ground_speed_kt, Velocity::STEP_KT, now_s);
                let track_step = said.track_step_deg().unwrap_or(0.0);
                self.track_deg
                    .keep_in_steps(said.track_deg, track_step, now_s);
                self.magnetic_heading_deg.keep_in_steps(
                    said.magnetic_heading_deg,
                    Velocity::HEADING_STEP_DEG,
                    now_s,
                );
                self.baro_vertical_rate_fpm.keep_in_steps(
                    said.baro_vertical_rate_fpm,
                    Velocity::RATE_STEP_FPM,
                    now_s,
                );
                self.geometric_vertical_rate_fpm.keep_in_steps(
                    said.geometric_vertical_rate_fpm,
                    Velocity::RATE_STEP_FPM,
                    now_s,
                );
                self.geometric_minus_baro_ft
                    .keep(said.geometric_minus_baro_ft, now_s);
                match said.airspeed {
                    Some(Airspeed::Indicated(kt)) => {
                        self.indicated_airspeed_kt.keep_in_steps(
                            Some(kt),
                            Velocity::STEP_KT,
                            now_s,
                        );
                    }
                    Some(Airspeed::True(kt)) => {
                        self.true_airspeed_kt
                            .keep_in_steps(Some(kt), Velocity::STEP_KT, now_s);
                    }
                    None => {}
                }
            }
            Report::Status(said) => {
                self.emergency_priority_status
                    .keep(Some(said.emergency_priority_status), now_s);
                self.mode_a_code.keep(said.mode_a_code, now_s);
            }
            Report::TargetStateAndStatus(said) => {
                self.target_state
                    .keep(&said.target, TargetStateAndStatus::STEPS, now_s);
                self.nac_p.keep(Some(said.nac_p), now_s);
            }
            Report::ResolutionAdvisory(said) => {
                self.advisory.keep(Some(said.advisory), now_s);
            }
            Report::OperationalStatus(said) => {
                self.nac_p.keep(said.nac_p, now_s);
                self.version = said.version;
                self.nic_supplement_a = said.nic_supplement_a;
                self.nic_supplement_c = said.nic_supplement_c;
            }
        }
    }

    /// What is known of the aircraft lately, to tell the registers apart by.
    fn known(&self, now_s: f64) -> Known {
        Known {
            track_deg: self.track_deg.lately(now_s).map(said),
            ground_speed_kt: self.ground_speed_kt.lately(now_s).map(said),
            true_airspeed_kt: self.true_airspeed_kt.lately(now_s).map(said),
            baro_altitude_ft: self.baro_altitude_ft.lately(now_s).map(said),
            magnetic_heading_deg: self.magnetic_heading_deg.lately(now_s).map(said),
            indicated_airspeed_kt: self.indicated_airspeed_kt.lately(now_s).map(said),
            mach: self.mach.lately(now_s).map(said),
        }
    }

    /// Takes what a register the aircraft answered with says, and derives
    /// what the air data say together.
    fn answer(&mut self, register: &Register, now_s: f64, site: Position) {
        match register {
            Register::Identification(callsign) => {
                self.remembered.callsign.keep(Some(callsign.clone()), now_s);
            }
            Register::ResolutionAdvisory(said) => {
                self.advisory.keep(Some(*said), now_s);
            }
            Register::SelectedVerticalIntention(said) => {
                self.target_state
                    .keep(&said.target, SelectedVerticalIntention::STEPS, now_s);
            }
            Register::TrackAndTurn(said) => {
                self.roll_deg.keep(said.roll_deg, now_s);
                self.track_deg
                    .keep_in_steps(said.track_deg, BEARING_STEP_DEG, now_s);
                self.ground_speed_kt.keep_in_steps(
                    said.ground_speed_kt,
                    TrackAndTurn::SPEED_STEP_KT,
                    now_s,
                );
                self.track_rate_deg_per_s
                    .keep(said.track_rate_deg_per_s, now_s);
                self.true_airspeed_kt.keep_in_steps(
                    said.true_airspeed_kt,
                    TrackAndTurn::SPEED_STEP_KT,
                    now_s,
                );
            }
            Register::HeadingAndSpeed(said) => {
                self.magnetic_heading_deg.keep_in_steps(
                    said.magnetic_heading_deg,
                    BEARING_STEP_DEG,
                    now_s,
                );
                self.indicated_airspeed_kt.keep_in_steps(
                    said.indicated_airspeed_kt,
                    HeadingAndSpeed::AIRSPEED_STEP_KT,
                    now_s,
                );
                self.mach.keep(said.mach, now_s);
                self.baro_vertical_rate_fpm.keep_in_steps(
                    said.baro_vertical_rate_fpm,
                    HeadingAndSpeed::RATE_STEP_FPM,
                    now_s,
                );
                self.geometric_vertical_rate_fpm.keep_in_steps(
                    said.inertial_vertical_rate_fpm,
                    HeadingAndSpeed::RATE_STEP_FPM,
                    now_s,
                );
            }
        }
        self.derive(now_s, site);
    }

    /// Derives what the air data say together, from values said within a
    /// sweep or two of one another: the temperatures from the Mach number
    /// and the airspeed, and the wind from the ground vector and the air
    /// vector; each heard when the oldest of what it is derived from was.
    fn derive(&mut self, now_s: f64, site: Position) {
        let mach = self.mach.lately(now_s);
        let airspeed = self.true_airspeed_kt.lately(now_s);
        let oat_c = mach.zip(airspeed).and_then(|(mach, tas)| {
            let oat_c = air::static_air_temperature_c(mach.said, tas.said)?;
            Some(derived(oat_c, mach.at_s.min(tas.at_s)))
        });
        let tat_c = oat_c.zip(mach).map(|(oat_c, mach)| {
            derived(
                air::total_air_temperature_c(oat_c.said, mach.said),
                oat_c.at_s,
            )
        });
        self.oat_c.keep_heard(oat_c);
        self.tat_c.keep_heard(tat_c);
        let wind = self.wind(now_s, site);
        self.wind.keep_heard(wind);
    }

    /// The wind the ground vector and the air vector say together, when both
    /// are of one sweep and the aircraft flies straight.
    fn wind(&self, now_s: f64, site: Position) -> Option<Heard<Wind>> {
        let straight = self
            .track_rate_deg_per_s
            .lately(now_s)
            .is_none_or(|rate| rate.said.abs() <= STRAIGHT_DEG_PER_S);
        let heard = |said: &Said<f64>| said.within(WIND_WITHIN_S, now_s);
        let track = heard(&self.track_deg)?;
        let speed = heard(&self.ground_speed_kt)?;
        let magnetic = heard(&self.magnetic_heading_deg)?;
        let airspeed = heard(&self.true_airspeed_kt)?;
        let heading = magnetic.said + self.declination(now_s, site);
        let oldest = [track, speed, magnetic, airspeed]
            .into_iter()
            .map(|heard| heard.at_s)
            .fold(f64::INFINITY, f64::min);
        let wind = air::wind(track.said, speed.said, heading, airspeed.said);
        straight.then(|| derived(wind, oldest))
    }

    /// Where the aircraft is, or else the site.
    fn whereabouts(&self, now_s: f64, site: Position) -> Position {
        self.fix.at(now_s).map_or(site, |fix| fix.said.position)
    }

    /// How far east of true north magnetic north lies where the aircraft is,
    /// or else at the site.
    fn declination(&self, now_s: f64, site: Position) -> f64 {
        self.whereabouts(now_s, site).declination_deg(now_s)
    }

    /// Takes the accuracy that a position message stands for, from an aircraft
    /// of version 0: it is one until it reports another.
    fn qualify(&mut self, nac_p_of_version_0: u32, now_s: f64) {
        if self.version == 0 {
            self.nac_p.keep(Some(nac_p_of_version_0), now_s);
        }
    }

    /// Where a position sent in the air puts the aircraft: by the position of
    /// the other format when that is recent, else by the last fix.
    fn airborne(&mut self, cpr: Cpr, now_s: f64) -> Option<Position> {
        let other = self.pairing[usize::from(!cpr.odd)]
            .filter(|(_, heard_s)| now_s - heard_s <= PAIR_WITHIN_S);
        self.pairing[usize::from(cpr.odd)] = Some((cpr, now_s));
        let paired = other.and_then(|(earlier, _)| cpr::global(earlier, cpr));
        paired.or_else(|| cpr::airborne_near(cpr, self.fix.at(now_s)?.said.position))
    }

    /// Takes a position that lies within what the receiver at the site can hear.
    fn place(
        &mut self,
        position: Option<Position>,
        integrity: Integrity,
        source: Source,
        now_s: f64,
        site: Position,
    ) {
        let in_range = |position: &Position| site.distance_nm(*position) <= MAX_RANGE_NM;
        let fix = position.filter(in_range).map(|position| Fix {
            position,
            integrity,
            source,
        });
        self.fix.keep(fix, now_s);
    }

    /// The aircraft as the feed carries it at `now_s`: every value that has
    /// not lapsed, with when it was heard.
    fn at(&self, now_s: f64) -> Aircraft {
        let on_ground = self.on_ground.at(now_s);
        // On the ground the altitude some still send is not one to fly by.
        let baro_altitude_ft = self
            .baro_altitude_ft
            .at(now_s)
            .filter(|_| !on_ground.is_some_and(said));
        let target = &self.target_state;
        let wind = self.wind.at(now_s);
        Aircraft {
            address: Some(self.address),
            reception: Some(Reception {
                messages: self.messages,
                rssi_dbfs: self.rssi_dbfs(),
                heard_ms: ms(self.seen_s),
            }),
            identification: self.remembered.at(now_s),
            position: self.fix.at(now_s).map(|fix| proto::Position {
                lat_deg: fix.said.position.lat_deg,
                lon_deg: fix.said.position.lon_deg,
                source: fix.said.source.into(),
                nic: fix.said.integrity.nic,
                rc_m: fix.said.integrity.rc_m,
                heard_ms: ms(fix.at_s),
            }),
            modes: target.modes(now_s),
            advisory: self.advisory.at(now_s).map(|advisory| Advisory {
                heard_ms: ms(advisory.at_s),
                ..advisory.said
            }),
            mode_a_code: self.mode_a_code.at(now_s).and_then(Heard::int),
            emergency: self
                .emergency_priority_status
                .at(now_s)
                .map(|status| Emergency {
                    status: status.said.into(),
                    heard_ms: ms(status.at_s),
                }),
            ident: self.ident.at(now_s).map(Heard::flag),
            on_ground: on_ground.map(Heard::flag),
            baro_altitude_ft: baro_altitude_ft.and_then(Heard::int),
            geometric_altitude_ft: self
                .geometric_altitude(baro_altitude_ft, now_s)
                .and_then(Heard::int),
            ground_speed_kt: self.ground_speed_kt.at(now_s).map(Heard::real),
            track_deg: self.track_deg.at(now_s).map(Heard::real),
            baro_vertical_rate_fpm: self.baro_vertical_rate_fpm.at(now_s).and_then(Heard::int),
            geometric_vertical_rate_fpm: self
                .geometric_vertical_rate_fpm
                .at(now_s)
                .and_then(Heard::int),
            indicated_airspeed_kt: self.indicated_airspeed_kt.at(now_s).map(Heard::real),
            true_airspeed_kt: self.true_airspeed_kt.at(now_s).map(Heard::real),
            mach: self.mach.at(now_s).map(Heard::real),
            magnetic_heading_deg: self.magnetic_heading_deg.at(now_s).map(Heard::real),
            roll_deg: self.roll_deg.at(now_s).map(Heard::real),
            track_rate_deg_per_s: self.track_rate_deg_per_s.at(now_s).map(Heard::real),
            selected_altitude_mcp_ft: target
                .selected_altitude_mcp_ft
                .at(now_s)
                .and_then(Heard::int),
            selected_altitude_fms_ft: target
                .selected_altitude_fms_ft
                .at(now_s)
                .and_then(Heard::int),
            selected_heading_deg: target.selected_heading_deg.at(now_s).map(Heard::real),
            baro_setting_hpa: target.baro_setting_hpa.at(now_s).map(Heard::real),
            nac_p: self.nac_p.at(now_s).and_then(Heard::int),
            wind_speed_kt: wind.map(|wind| wind.map(|wind| wind.speed_kt).real()),
            wind_dir_deg: wind.map(|wind| wind.map(|wind| wind.from_deg).real()),
            oat_c: self.oat_c.at(now_s).map(Heard::real),
            tat_c: self.tat_c.at(now_s).map(Heard::real),
            registry: None,
        }
    }

    /// The GNSS height at `now_s`: as reported, or worked out from the
    /// pressure altitude and the difference a velocity gives, whichever was
    /// heard later; the reported one when heard together.
    fn geometric_altitude(&self, baro: Option<Heard<i32>>, now_s: f64) -> Option<Heard<i32>> {
        let reported = self.geometric_altitude_ft.at(now_s);
        let difference = self.geometric_minus_baro_ft.at(now_s);
        let worked_out = baro.zip(difference).map(|(baro, difference)| {
            derived(baro.said + difference.said, baro.at_s.min(difference.at_s))
        });
        [worked_out, reported]
            .into_iter()
            .flatten()
            .max_by(|a, b| a.at_s.total_cmp(&b.at_s))
    }

    /// The mean power of the last messages, in dB against full scale.
    fn rssi_dbfs(&self) -> Option<f64> {
        let measured = u32::try_from(self.powers.len())
            .ok()
            .filter(|count| *count > 0)?;
        let mean = self.powers.iter().sum::<f64>() / f64::from(measured);
        Some(10.0 * mean.log10())
    }
}

#[cfg(test)]
mod tests {
    use super::Traffic;
    use crate::beast::{Frame, Observation};
    use crate::bits::Bits;
    use crate::cpr;
    use crate::field::{
        AirbornePosition, Airspeed, Field, Identification, ModesReported, OperationalStatus,
        RaBroadcast, Status, SurfacePosition, TargetState, TargetStateAndStatus, Velocity,
    };
    use crate::message::{Reply, Report, Trust, squitter};
    use crate::position::Position;
    use crate::proto::{
        self, Address, AddressType, Advisory, Aircraft, EmergencyPriorityStatus, EmitterCategory,
        Flag, Int, Modes, Real, Reception, Snapshot, Source, advisory::Resolution, reported,
    };
    use crate::register::{HeadingAndSpeed, Register, SelectedVerticalIntention, TrackAndTurn};

    /// Made up: from a block ICAO reserves for future use.
    const ADDRESS: u32 = 0x00d0_0001;
    /// RJFF
    const SITE: Position = Position {
        lat_deg: 33.5844,
        lon_deg: 130.4517,
    };
    /// 30 NM to the north of the site, and a mile further.
    const NORTH: Position = Position {
        lat_deg: SITE.lat_deg + 0.5,
        ..SITE
    };
    const FURTHER: Position = Position {
        lat_deg: NORTH.lat_deg + 1.0 / 60.0,
        ..NORTH
    };
    const RSSI_DBFS: f64 = -20.0;

    fn icao(value: u32) -> Address {
        Address::new(value, AddressType::Icao)
    }

    fn from(address: u32, report: Report) -> Observation {
        Observation {
            address: icao(address),
            trust: Trust::Announced,
            source: Source::Unspecified,
            rssi_dbfs: Some(RSSI_DBFS),
            report,
        }
    }

    fn said(report: Report) -> Observation {
        from(ADDRESS, report)
    }

    fn identification(callsign: &str) -> Report {
        Report::Identification(Identification {
            identification: Some(callsign.into()),
            emitter_category: EmitterCategory::A3Large,
        })
    }

    fn velocity(ground_speed_kt: f64, track_deg: f64) -> Report {
        Report::Velocity(Velocity {
            ground_speed_kt: Some(ground_speed_kt),
            track_deg: Some(track_deg),
            airspeed: None,
            magnetic_heading_deg: None,
            baro_vertical_rate_fpm: Some(-1216),
            geometric_vertical_rate_fpm: None,
            geometric_minus_baro_ft: None,
        })
    }

    fn altitude(baro_altitude_ft: i32, on_ground: Option<bool>) -> Report {
        Report::Reply(Reply {
            on_ground,
            baro_altitude_ft: Some(baro_altitude_ft),
            ..Reply::default()
        })
    }

    fn identity(mode_a_code: u32, on_ground: Option<bool>) -> Report {
        Report::Reply(Reply {
            on_ground,
            mode_a_code: Some(mode_a_code),
            ..Reply::default()
        })
    }

    /// An all-call reply that says no more than that the aircraft is there.
    fn here() -> Report {
        Report::Reply(Reply::default())
    }

    /// A Comm-B reply with the register.
    fn answered(register: &Register) -> Report {
        Report::Reply(Reply {
            comm_b: Some(register.write()),
            ..Reply::default()
        })
    }

    fn track_and_turn(track_deg: f64, ground_speed_kt: f64, true_airspeed_kt: f64) -> Register {
        Register::TrackAndTurn(TrackAndTurn {
            track_deg: Some(track_deg),
            ground_speed_kt: Some(ground_speed_kt),
            true_airspeed_kt: Some(true_airspeed_kt),
            ..TrackAndTurn::default()
        })
    }

    fn airborne(at: Position, odd: bool) -> Observation {
        said(Report::AirbornePosition(AirbornePosition {
            cpr: cpr::airborne(at, odd),
            baro_altitude_ft: Some(10_000),
            geometric_altitude_ft: None,
            type_code: 11,
            nic_supplement_b: false,
        }))
    }

    fn surface(at: Position, odd: bool) -> Observation {
        said(Report::SurfacePosition(SurfacePosition {
            cpr: cpr::surface(at, odd),
            ground_speed_kt: Some(18.0),
            track_deg: Some(340.3125),
            type_code: 7,
        }))
    }

    /// The traffic after each message, heard at its time.
    fn hearing(messages: impl IntoIterator<Item = (Observation, f64)>) -> Traffic {
        let mut traffic = Traffic::new(SITE);
        for (observation, now_s) in messages {
            traffic.take(&observation, now_s);
        }
        traffic
    }

    fn is_at(known: &Aircraft, at: Position) -> bool {
        known
            .place()
            .is_some_and(|place| place.distance_nm(at) < 0.01)
    }

    fn category(known: &Aircraft) -> Option<EmitterCategory> {
        let identification = known.identification.as_ref()?;
        EmitterCategory::try_from(identification.emitter_category?).ok()
    }

    /// The target state: the altitudes, the heading and the setting.
    fn selected(known: &Aircraft) -> (Option<i32>, Option<i32>, Option<f64>, Option<f64>) {
        (
            reported(known.selected_altitude_mcp_ft),
            reported(known.selected_altitude_fms_ft),
            reported(known.selected_heading_deg),
            reported(known.baro_setting_hpa),
        )
    }

    /// What is derived: the wind's direction and speed, and the temperatures.
    fn derived(known: &Aircraft) -> [Option<f64>; 4] {
        [
            reported(known.wind_dir_deg),
            reported(known.wind_speed_kt),
            reported(known.oat_c),
            reported(known.tat_c),
        ]
    }

    /// The traffic after each report from the made-up address, one second apart from 100 s on.
    fn after(reports: impl IntoIterator<Item = Report>) -> Traffic {
        let mut traffic = Traffic::new(SITE);
        for (report, second) in reports.into_iter().zip(0_u32..) {
            traffic.take(&said(report), 100.0 + f64::from(second));
        }
        traffic
    }

    /// The one aircraft in a snapshot taken at 110 s.
    fn known(mut traffic: Traffic) -> Aircraft {
        let mut aircraft = traffic.snapshot(110.0).aircraft;
        assert_eq!(aircraft.len(), 1, "{aircraft:?}");
        aircraft.remove(0)
    }

    #[test]
    fn aircraft_is_known_by_what_its_messages_said_and_when() {
        // Arrange
        let mut traffic = Traffic::new(SITE);
        traffic.take(&said(identification("TEST01")), 100.0);

        // Act
        traffic.take(&said(velocity(290.0, 235.0)), 101.0);

        // Assert
        let expected = Snapshot {
            now_ms: 103_000,
            messages: 2,
            aircraft: vec![Aircraft {
                address: Some(icao(ADDRESS)),
                reception: Some(Reception {
                    messages: 2,
                    rssi_dbfs: Some(RSSI_DBFS),
                    heard_ms: 101_000,
                }),
                identification: Some(proto::Identification {
                    callsign: Some("TEST01".into()),
                    emitter_category: Some(EmitterCategory::A3Large.into()),
                    heard_ms: 100_000,
                }),
                ground_speed_kt: Some(Real {
                    value: 290.0,
                    heard_ms: 101_000,
                }),
                track_deg: Some(Real {
                    value: 235.0,
                    heard_ms: 101_000,
                }),
                baro_vertical_rate_fpm: Some(Int {
                    value: -1216,
                    heard_ms: 101_000,
                }),
                ..Aircraft::default()
            }],
        };
        assert_eq!(traffic.snapshot(103.0), expected);
    }

    #[test]
    fn report_keeps_its_instant_from_one_snapshot_to_the_next() {
        // Arrange
        let mut traffic = after([identification("TEST01"), velocity(290.0, 235.0)]);

        // Act
        let carried =
            [103.0, 130.0].map(|now_s| traffic.snapshot(now_s).aircraft.remove(0).ground_speed_kt);

        // Assert
        let heard = Some(Real {
            value: 290.0,
            heard_ms: 101_000,
        });
        assert_eq!(carried, [heard, heard]);
    }

    #[test]
    fn frames_are_heard_for_what_their_messages_say() {
        // Arrange: the made-up aircraft's identification twice, and once damaged
        let me = Identification {
            identification: Some("TEST01".into()),
            emitter_category: EmitterCategory::A3Large,
        }
        .write();
        let message = squitter(ADDRESS, me);
        let mut damaged = message;
        damaged[5] ^= 0x01;
        let frames = [message, message, damaged]
            .map(|message| Frame::new(0, 128, &message).expect("a message"));
        let mut traffic = Traffic::new(SITE);

        // Act
        traffic.hear(&frames, 100.0);

        // Assert
        let snapshot = traffic.snapshot(100.0);
        let callsigns: Vec<_> = snapshot.aircraft.iter().map(Aircraft::callsign).collect();
        assert_eq!((snapshot.messages, callsigns), (2, vec![Some("TEST01")]));
    }

    #[test]
    fn aircraft_heard_once_is_left_out_as_possible_noise() {
        // Arrange
        let mut traffic = Traffic::new(SITE);

        // Act
        traffic.take(&said(identification("TEST01")), 100.0);

        // Assert
        assert_eq!(traffic.snapshot(101.0).aircraft, vec![]);
    }

    #[test]
    fn aircraft_come_in_the_order_of_their_addresses() {
        // Arrange
        let mut traffic = Traffic::new(SITE);
        let addresses = [ADDRESS + 2, ADDRESS, ADDRESS + 1];

        // Act
        for address in addresses.into_iter().chain(addresses) {
            traffic.take(&from(address, identification("TEST01")), 100.0);
        }

        // Assert
        let snapshot = traffic.snapshot(101.0);
        let known: Vec<_> = snapshot.aircraft.iter().map(|a| a.address).collect();
        assert_eq!(
            known,
            [ADDRESS, ADDRESS + 1, ADDRESS + 2].map(|a| Some(icao(a)))
        );
        assert_eq!(snapshot.messages, 6);
    }

    #[test]
    fn address_recovered_from_a_parity_is_believed_only_of_an_aircraft_already_known() {
        // Arrange
        let reply = |address| Observation {
            trust: Trust::Recovered,
            ..from(address, altitude(2500, None))
        };
        let mut traffic = Traffic::new(SITE);
        traffic.take(&said(identification("TEST01")), 100.0);

        // Act
        for address in [ADDRESS, ADDRESS + 1, ADDRESS + 1] {
            traffic.take(&reply(address), 101.0);
        }

        // Assert
        let snapshot = traffic.snapshot(102.0);
        let known: Vec<_> = snapshot
            .aircraft
            .iter()
            .map(|a| (a.address, reported(a.baro_altitude_ft)))
            .collect();
        assert_eq!(known, [(Some(icao(ADDRESS)), Some(2500))]);
        assert_eq!(snapshot.messages, 2);
    }

    #[test]
    fn later_message_replaces_what_an_earlier_one_said_and_keeps_what_it_leaves_out() {
        // Arrange
        let nameless = Report::Identification(Identification {
            identification: None,
            emitter_category: EmitterCategory::A5Heavy,
        });
        let stopped = Report::Velocity(Velocity {
            ground_speed_kt: None,
            track_deg: None,
            airspeed: None,
            magnetic_heading_deg: None,
            baro_vertical_rate_fpm: None,
            geometric_vertical_rate_fpm: None,
            geometric_minus_baro_ft: None,
        });
        let earlier = [identification("TEST01"), velocity(290.0, 235.0)];

        // Act
        let traffic = after(
            earlier
                .into_iter()
                .chain([nameless, stopped, velocity(300.0, 240.0)]),
        );

        // Assert
        let known = known(traffic);
        assert_eq!(known.callsign(), Some("TEST01"));
        assert_eq!(category(&known), Some(EmitterCategory::A5Heavy));
        assert_eq!(reported(known.ground_speed_kt), Some(300.0));
        assert_eq!(reported(known.track_deg), Some(240.0));
        assert_eq!(reported(known.baro_vertical_rate_fpm), Some(-1216));
    }

    #[test]
    fn identification_is_heard_when_the_callsign_or_the_category_was_last() {
        // Arrange: the message at 100 s, then the register with another callsign at 105 s
        let messages = [
            (said(identification("TEST01")), 100.0),
            (
                said(answered(&Register::Identification("TEST02".into()))),
                105.0,
            ),
        ];

        let mut traffic = hearing(messages);

        // Act
        let known = traffic.snapshot(106.0).aircraft.remove(0);

        // Assert
        let expected = proto::Identification {
            callsign: Some("TEST02".into()),
            emitter_category: Some(EmitterCategory::A3Large.into()),
            heard_ms: 105_000,
        };
        assert_eq!(known.identification, Some(expected));
    }

    #[test]
    fn vertical_rate_is_known_by_the_source_a_velocity_gives_it_from() {
        // Arrange
        let geometric = Report::Velocity(Velocity {
            ground_speed_kt: None,
            track_deg: None,
            airspeed: None,
            magnetic_heading_deg: None,
            baro_vertical_rate_fpm: None,
            geometric_vertical_rate_fpm: Some(-832),
            geometric_minus_baro_ft: None,
        });

        // Act
        let traffic = after([velocity(290.0, 235.0), geometric]);

        // Assert
        let known = known(traffic);
        assert_eq!(reported(known.baro_vertical_rate_fpm), Some(-1216));
        assert_eq!(reported(known.geometric_vertical_rate_fpm), Some(-832));
    }

    #[test]
    fn altitude_comes_from_replies_and_from_position_messages() {
        // Arrange
        let position = |baro_altitude_ft, geometric_altitude_ft| {
            Report::AirbornePosition(AirbornePosition {
                cpr: crate::cpr::Cpr {
                    odd: false,
                    lat: 0,
                    lon: 0,
                },
                baro_altitude_ft,
                geometric_altitude_ft,
                type_code: 11,
                nic_supplement_b: false,
            })
        };
        let reports = [
            vec![altitude(2500, None), altitude(2525, None)],
            vec![position(Some(2500), None), position(Some(2550), None)],
            vec![position(None, Some(2600)), position(None, Some(2650))],
        ];

        // Act
        let known = reports.map(|reports| known(after(reports)));

        // Assert
        let altitudes = known.map(|a| {
            (
                reported(a.baro_altitude_ft),
                reported(a.geometric_altitude_ft),
            )
        });
        assert_eq!(
            altitudes,
            [(Some(2525), None), (Some(2550), None), (None, Some(2650))]
        );
    }

    #[test]
    fn gnss_height_is_the_pressure_altitude_with_the_difference_a_velocity_gives() {
        // Arrange
        let higher = Report::Velocity(Velocity {
            ground_speed_kt: None,
            track_deg: None,
            airspeed: None,
            magnetic_heading_deg: None,
            baro_vertical_rate_fpm: None,
            geometric_vertical_rate_fpm: None,
            geometric_minus_baro_ft: Some(550),
        });

        // Act
        let traffic = after([higher, altitude(38_000, None)]);

        // Assert: heard with the difference, the older of the two
        let known = known(traffic);
        assert_eq!(reported(known.baro_altitude_ft), Some(38_000));
        let height = Int {
            value: 38_550,
            heard_ms: 100_000,
        };
        assert_eq!(known.geometric_altitude_ft, Some(height));
    }

    #[test]
    fn aircraft_on_the_ground_is_at_no_pressure_altitude() {
        // Arrange: an altitude is still sent on the ground by some
        let reports = [
            [altitude(0, Some(true)), altitude(25, None)],
            [altitude(0, Some(true)), altitude(25, Some(false))],
        ];

        // Act
        let known = reports.map(|reports| known(after(reports)));

        // Assert
        let states = known.map(|a| (reported(a.on_ground), reported(a.baro_altitude_ft)));
        assert_eq!(states, [(Some(true), None), (Some(false), Some(25))]);
    }

    #[test]
    fn all_call_and_identity_replies_say_whether_it_is_on_the_ground_too() {
        // Arrange
        let reports = [
            Report::Reply(Reply {
                on_ground: Some(true),
                ..Reply::default()
            }),
            identity(0o2431, Some(true)),
        ];

        // Act
        let known = reports.map(|report| known(after([identification("TEST01"), report])));

        // Assert
        assert_eq!(known.map(|a| reported(a.on_ground)), [Some(true); 2]);
    }

    #[test]
    fn mode_a_code_and_emergency_come_from_status_and_identity() {
        // Arrange
        let status = Report::Status(Status {
            emergency_priority_status: EmergencyPriorityStatus::GeneralEmergency,
            mode_a_code: Some(0o7700),
        });
        let code_free = Report::Status(Status {
            emergency_priority_status: EmergencyPriorityStatus::NoEmergency,
            mode_a_code: None,
        });
        let reports = [
            vec![status.clone(), status.clone()],
            vec![status.clone(), code_free],
            vec![status, identity(0o2431, None)],
        ];

        // Act
        let known = reports.map(|reports| known(after(reports)));

        // Assert
        let statuses = known.map(|a| (reported(a.mode_a_code), a.emergency.map(|e| e.status())));
        let expected = [
            (
                Some(0o7700),
                Some(EmergencyPriorityStatus::GeneralEmergency),
            ),
            (Some(0o7700), Some(EmergencyPriorityStatus::NoEmergency)),
            (
                Some(0o2431),
                Some(EmergencyPriorityStatus::GeneralEmergency),
            ),
        ];
        assert_eq!(statuses, expected);
    }

    #[test]
    fn airspeed_is_indicated_or_true() {
        // Arrange
        let through_the_air = |airspeed| {
            Report::Velocity(Velocity {
                ground_speed_kt: None,
                track_deg: None,
                airspeed: Some(airspeed),
                magnetic_heading_deg: None,
                baro_vertical_rate_fpm: None,
                geometric_vertical_rate_fpm: None,
                geometric_minus_baro_ft: None,
            })
        };
        let reports = [Airspeed::Indicated(250.0), Airspeed::True(375.0)].map(through_the_air);

        // Act
        let traffic = after(reports);

        // Assert
        let known = known(traffic);
        assert_eq!(reported(known.indicated_airspeed_kt), Some(250.0));
        assert_eq!(reported(known.true_airspeed_kt), Some(375.0));
    }

    #[test]
    fn target_state_and_accuracy_are_what_was_last_reported() {
        // Arrange
        let target = TargetState {
            selected_altitude_mcp_ft: Some(6000),
            baro_setting_hpa: Some(1013.6),
            ..TargetState::default()
        };
        let reports = [
            Report::OperationalStatus(OperationalStatus {
                on_ground: false,
                version: 2,
                nic_supplement_a: false,
                nic_supplement_c: false,
                nac_p: Some(10),
            }),
            Report::TargetStateAndStatus(TargetStateAndStatus { target, nac_p: 9 }),
            Report::OperationalStatus(OperationalStatus {
                on_ground: false,
                version: 0,
                nic_supplement_a: false,
                nic_supplement_c: false,
                nac_p: None,
            }),
        ];

        // Act
        let traffic = after(reports);

        // Assert
        let known = known(traffic);
        assert_eq!(selected(&known), (Some(6000), None, None, Some(1013.6)));
        assert_eq!(known.modes, None);
        assert_eq!(reported(known.nac_p), Some(9));
        assert_eq!(known.position, None);
    }

    #[test]
    fn signal_is_the_mean_power_of_the_last_eight_messages() {
        // Arrange: four messages at -20 dBFS that are to be forgotten, then four more, then four at -10
        let mut traffic = Traffic::new(SITE);
        let powers = [[-20.0; 4], [-20.0; 4], [-10.0; 4]].concat();

        // Act
        for rssi_dbfs in powers {
            let heard = Observation {
                rssi_dbfs: Some(rssi_dbfs),
                ..said(identification("TEST01"))
            };
            traffic.take(&heard, 100.0);
        }

        // Assert: half at a hundredth and half at a tenth of full scale
        let rssi = known(traffic).reception.and_then(|r| r.rssi_dbfs);
        let expected = 10.0 * f64::midpoint(0.01, 0.1).log10();
        assert!(
            rssi.is_some_and(|rssi| (rssi - expected).abs() < 1e-9),
            "{rssi:?}"
        );
    }

    #[test]
    fn message_without_a_measured_signal_leaves_the_mean_alone() {
        // Arrange
        let unmeasured = Observation {
            rssi_dbfs: None,
            ..said(identification("TEST01"))
        };
        let mut traffic = Traffic::new(SITE);
        traffic.take(&unmeasured, 100.0);

        // Act
        traffic.take(&unmeasured, 101.0);

        // Assert
        let reception = known(traffic).reception;
        assert_eq!(reception.and_then(|r| r.rssi_dbfs), None);
        assert_eq!(reception.map(|r| r.messages), Some(2));
    }

    #[test]
    fn aircraft_is_placed_by_a_position_of_each_format_within_ten_seconds() {
        // Arrange
        let messages = [
            (airborne(NORTH, false), 100.0),
            (airborne(NORTH, true), 101.0),
        ];

        // Act
        let traffic = hearing(messages);

        // Assert: with the integrity of type code 11, heard with the pair's second
        let known = known(traffic);
        assert!(is_at(&known, NORTH), "{:?}", known.place());
        let position = known.position.expect("placed");
        assert_eq!(position.source(), Source::Unspecified);
        assert_eq!(
            (position.nic, position.rc_m, position.heard_ms),
            (8, Some(186), 101_000)
        );
    }

    #[test]
    fn position_of_one_format_alone_places_nothing() {
        // Arrange
        let messages = [
            (airborne(NORTH, false), 100.0),
            (airborne(NORTH, false), 101.0),
        ];

        // Act
        let traffic = hearing(messages);

        // Assert
        assert_eq!(known(traffic).position, None);
    }

    #[test]
    fn positions_more_than_ten_seconds_apart_do_not_pair() {
        // Arrange
        let messages = [
            (airborne(NORTH, false), 100.0),
            (airborne(NORTH, true), 110.5),
        ];

        // Act
        let traffic = hearing(messages);

        // Assert
        assert_eq!(known(traffic).place(), None);
    }

    #[test]
    fn position_without_its_pair_is_placed_by_the_last_fix() {
        // Arrange: the odd message is too old to pair with by then
        let fixed = [
            (airborne(NORTH, false), 60.0),
            (airborne(NORTH, true), 61.0),
        ];

        // Act
        let traffic = hearing(fixed.into_iter().chain([(airborne(FURTHER, false), 105.0)]));

        // Assert
        let known = known(traffic);
        assert!(is_at(&known, FURTHER), "{:?}", known.place());
        assert_eq!(known.position.map(|p| p.heard_ms), Some(105_000));
    }

    #[test]
    fn position_long_after_the_last_fix_is_not_placed_by_it() {
        // Arrange
        let fixed = [
            (airborne(NORTH, false), 30.0),
            (airborne(NORTH, true), 31.0),
        ];

        // Act: more than a minute later
        let traffic = hearing(fixed.into_iter().chain([(airborne(FURTHER, false), 105.0)]));

        // Assert
        let known = known(traffic);
        assert!(!is_at(&known, FURTHER), "{:?}", known.place());
    }

    #[test]
    fn position_beyond_the_range_of_a_receiver_is_refused() {
        // Arrange: over Hokkaido, 800 NM from the site
        let far = Position {
            lat_deg: 43.0,
            lon_deg: 143.0,
        };
        let messages = [(airborne(far, false), 100.0), (airborne(far, true), 101.0)];

        // Act
        let traffic = hearing(messages);

        // Assert
        assert_eq!(known(traffic).place(), None);
    }

    #[test]
    fn aircraft_on_the_ground_is_placed_by_the_site_at_once() {
        // Arrange: on the apron, a little off the site
        let apron = Position {
            lat_deg: SITE.lat_deg + 0.003,
            lon_deg: SITE.lon_deg - 0.004,
        };
        let messages = [
            (surface(apron, false), 100.0),
            (surface(apron, false), 101.0),
        ];

        // Act
        let traffic = hearing(messages);

        // Assert
        let known = known(traffic);
        assert!(is_at(&known, apron), "{:?}", known.place());
        assert_eq!(reported(known.on_ground), Some(true));
        assert_eq!(reported(known.ground_speed_kt), Some(18.0));
        assert_eq!(reported(known.track_deg), Some(340.3125));
    }

    #[test]
    fn position_in_the_air_takes_the_aircraft_off_the_ground() {
        // Arrange
        let messages = [
            (surface(SITE, false), 100.0),
            (airborne(SITE, false), 101.0),
        ];

        // Act
        let traffic = hearing(messages);

        // Assert
        assert_eq!(reported(known(traffic).on_ground), Some(false));
    }

    #[test]
    fn position_is_marked_with_how_its_message_came() {
        // Arrange
        let multilaterated = |odd| Observation {
            source: Source::Mlat,
            ..airborne(NORTH, odd)
        };

        // Act
        let traffic = hearing([
            (multilaterated(false), 100.0),
            (multilaterated(true), 101.0),
        ]);

        // Assert
        let source = known(traffic).position.map(|p| p.source());
        assert_eq!(source, Some(Source::Mlat));
    }

    #[test]
    fn integrity_of_a_position_follows_the_supplements_the_aircraft_reported() {
        // Arrange: version 2 with NIC supplement A, then positions with supplement B
        let status = Report::OperationalStatus(OperationalStatus {
            on_ground: false,
            version: 2,
            nic_supplement_a: true,
            nic_supplement_c: false,
            nac_p: Some(10),
        });
        let supplemented = |odd| {
            let mut heard = airborne(NORTH, odd);
            if let Report::AirbornePosition(position) = &mut heard.report {
                position.nic_supplement_b = true;
            }
            heard
        };
        let messages = [
            (said(status), 99.0),
            (supplemented(false), 100.0),
            (supplemented(true), 101.0),
        ];

        // Act
        let traffic = hearing(messages);

        // Assert
        let known = known(traffic);
        let position = known.position.expect("placed");
        assert_eq!((position.nic, position.rc_m), (9, Some(75)));
        assert_eq!(reported(known.nac_p), Some(10));
    }

    #[test]
    fn accuracy_of_an_aircraft_of_version_0_is_that_of_its_position_type_code() {
        // Arrange: such an aircraft reports no accuracy, and no version either
        let messages = [
            (airborne(NORTH, false), 100.0),
            (airborne(NORTH, true), 101.0),
        ];

        // Act
        let traffic = hearing(messages);

        // Assert: type code 11 stands for an accuracy category of 8
        let known = known(traffic);
        let nic = known.position.map(|p| p.nic);
        assert_eq!((nic, reported(known.nac_p)), (Some(8), Some(8)));
    }

    #[test]
    fn aircraft_not_heard_for_a_minute_is_no_longer_listed() {
        // Arrange
        let mut traffic = after([identification("TEST01"), velocity(290.0, 235.0)]);

        // Act: just short of a minute after the last message, and a minute after it
        let listed = [160.9, 161.0].map(|now_s| traffic.snapshot(now_s).aircraft.len());

        // Assert
        assert_eq!(listed, [1, 0]);
    }

    #[test]
    fn aircraft_forgotten_is_unknown_again() {
        // Arrange
        let mut traffic = after([identification("TEST01"), velocity(290.0, 235.0)]);
        let forgetting = traffic.snapshot(170.0);
        let reply = Observation {
            trust: Trust::Recovered,
            ..said(altitude(2500, None))
        };

        // Act
        for now_s in [171.0, 172.0] {
            traffic.take(&reply, now_s);
        }

        // Assert
        assert_eq!(forgetting.aircraft, vec![]);
        assert_eq!(traffic.snapshot(173.0).aircraft, vec![]);
    }

    #[test]
    fn aircraft_forgotten_keeps_its_callsign_and_category_for_when_it_is_heard_again() {
        // Arrange: heard again without saying either
        let mut traffic = after([identification("TEST01"), velocity(290.0, 235.0)]);
        let forgetting = traffic.snapshot(170.0);
        for now_s in [400.0, 401.0] {
            traffic.take(&said(here()), now_s);
        }

        // Act
        let mut snapshot = traffic.snapshot(402.0);

        // Assert: all else starts anew
        assert_eq!(forgetting.aircraft, vec![]);
        let known = snapshot.aircraft.remove(0);
        assert_eq!(known.callsign(), Some("TEST01"));
        assert_eq!(category(&known), Some(EmitterCategory::A3Large));
        assert_eq!(known.reception.map(|r| r.messages), Some(2));
    }

    #[test]
    fn nothing_is_kept_of_an_aircraft_forgotten_once_its_callsign_and_category_lapse() {
        // Arrange
        let mut traffic = after([identification("TEST01"), velocity(290.0, 235.0)]);

        // Act: just short of fifteen minutes after the identification, and fifteen minutes after it
        let kept = [999.9, 1000.0].map(|now_s| {
            traffic.snapshot(now_s);
            traffic.remembered.len()
        });

        // Assert
        assert_eq!(kept, [1, 0]);
    }

    #[test]
    fn what_is_no_longer_said_lapses_after_a_minute_while_the_aircraft_is_heard() {
        // Arrange: only all-call replies after the first seconds
        let mut traffic = hearing([
            (said(identity(0o2431, None)), 100.0),
            (said(velocity(290.0, 235.0)), 105.0),
            (said(here()), 150.0),
            (said(here()), 164.0),
        ]);

        // Act: a minute after the identity reply, and a minute after the velocity
        let snapshots = [160.0, 165.0].map(|now_s| traffic.snapshot(now_s));

        // Assert
        let known = snapshots.map(|mut snapshot| snapshot.aircraft.remove(0));
        let said = known.map(|a| (reported(a.mode_a_code), reported(a.ground_speed_kt)));
        assert_eq!(said, [(None, Some(290.0)), (None, None)]);
    }

    #[test]
    fn callsign_and_category_are_kept_for_fifteen_minutes_while_the_aircraft_is_heard() {
        // Arrange: only an all-call reply after the identification
        let mut traffic = hearing([
            (said(identification("TEST01")), 100.0),
            (said(here()), 999.0),
        ]);

        // Act: just short of fifteen minutes after the identification, and fifteen minutes after it
        let snapshots = [999.9, 1000.0].map(|now_s| traffic.snapshot(now_s));

        // Assert
        let known = snapshots.map(|mut snapshot| snapshot.aircraft.remove(0));
        let kept = known.map(|a| (a.callsign().map(String::from), category(&a)));
        let said = (Some("TEST01".into()), Some(EmitterCategory::A3Large));
        assert_eq!(kept, [said, (None, None)]);
    }

    #[test]
    fn position_not_renewed_for_a_minute_is_gone_while_the_aircraft_is_listed() {
        // Arrange
        let mut traffic = hearing([
            (airborne(NORTH, false), 100.0),
            (airborne(NORTH, true), 101.0),
            (said(here()), 165.0),
        ]);

        // Act
        let mut snapshot = traffic.snapshot(166.0);

        // Assert
        let known = snapshot.aircraft.remove(0);
        assert_eq!(known.position, None);
    }

    #[test]
    fn ident_is_carried_as_last_reported_until_it_lapses() {
        // Arrange: one reply with the identification pulse, then nothing of it
        let identing = Report::Reply(Reply {
            ident: Some(true),
            ..Reply::default()
        });
        let mut traffic = hearing([
            (said(here()), 99.0),
            (said(identing), 100.0),
            (said(here()), 130.0),
        ]);

        // Act: within 18 s of it, at 18 s, and a minute after
        let carried =
            [117.9, 118.0, 160.0].map(|now_s| traffic.snapshot(now_s).aircraft.remove(0).ident);

        // Assert: how long it is shown for is the scope's to say
        let identing = Some(Flag {
            value: true,
            heard_ms: 100_000,
        });
        assert_eq!(carried, [identing, identing, None]);
    }

    #[test]
    fn ident_ends_with_a_reply_that_says_so() {
        // Arrange
        let identing = |ident| {
            Report::Reply(Reply {
                ident: Some(ident),
                ..Reply::default()
            })
        };

        // Act
        let traffic = after([identing(true), identing(false)]);

        // Assert
        assert_eq!(reported(known(traffic).ident), Some(false));
    }

    #[test]
    fn heading_comes_from_the_velocity_through_the_air_too() {
        // Arrange
        let through_the_air = Report::Velocity(Velocity {
            ground_speed_kt: None,
            track_deg: None,
            airspeed: Some(Airspeed::True(375.0)),
            magnetic_heading_deg: Some(243.984_375),
            baro_vertical_rate_fpm: None,
            geometric_vertical_rate_fpm: None,
            geometric_minus_baro_ft: None,
        });

        // Act
        let traffic = after([through_the_air.clone(), through_the_air]);

        // Assert
        assert_eq!(
            reported(known(traffic).magnetic_heading_deg),
            Some(243.984_375)
        );
    }

    #[test]
    fn roll_and_track_rate_come_from_the_track_and_turn_report() {
        // Arrange: "The 1090 Megahertz Riddle", banked left and turning left
        let report = Register::TrackAndTurn(TrackAndTurn {
            roll_deg: Some(-9.667_968_75),
            track_deg: Some(140.273_437_5),
            ground_speed_kt: Some(476.0),
            track_rate_deg_per_s: Some(-0.406_25),
            true_airspeed_kt: Some(466.0),
        });

        // Act
        let traffic = after([here(), answered(&report)]);

        // Assert
        let known = known(traffic);
        assert_eq!(reported(known.roll_deg), Some(-9.667_968_75));
        assert_eq!(reported(known.track_rate_deg_per_s), Some(-0.406_25));
    }

    #[test]
    fn advisory_comes_from_the_broadcast_and_from_the_register() {
        // Arrange: a climb broadcast, then a descent answered, then ended in a broadcast
        let advising = |downward, terminated| Advisory {
            multiple_threats: false,
            resolution: Some(Resolution {
                corrective: true,
                downward,
                positive: true,
                ..Resolution::default()
            }),
            corrections: None,
            terminated,
            ..Advisory::default()
        };
        let broadcast = |downward, terminated| {
            Report::ResolutionAdvisory(RaBroadcast {
                advisory: advising(downward, terminated),
            })
        };
        let reports = [
            vec![here(), broadcast(false, false)],
            vec![
                here(),
                answered(&Register::ResolutionAdvisory(advising(true, false))),
            ],
            vec![broadcast(false, false), broadcast(false, true)],
        ];

        // Act
        let known = reports.map(|reports| known(after(reports)));

        // Assert: each heard with the second message
        let heard = |advisory| {
            Some(Advisory {
                heard_ms: 101_000,
                ..advisory
            })
        };
        let expected = [
            heard(advising(false, false)),
            heard(advising(true, false)),
            heard(advising(false, true)),
        ];
        assert_eq!(known.map(|a| a.advisory), expected);
    }

    #[test]
    fn advisory_is_carried_for_a_minute_like_the_rest() {
        // Arrange: an advisory broadcast at 100 s as ended
        let ended = Advisory {
            resolution: Some(Resolution {
                corrective: true,
                positive: true,
                ..Resolution::default()
            }),
            terminated: true,
            ..Advisory::default()
        };
        let messages = [
            (said(here()), 99.0),
            (
                said(Report::ResolutionAdvisory(RaBroadcast { advisory: ended })),
                100.0,
            ),
            (said(here()), 130.0),
        ];
        let mut traffic = hearing(messages);

        // Act: 18 s after it, and a minute after it
        let carried =
            [118.0, 160.0].map(|now_s| traffic.snapshot(now_s).aircraft.remove(0).advisory);

        // Assert: how long it is shown for is the scope's to say
        let heard = Advisory {
            heard_ms: 100_000,
            ..ended
        };
        assert_eq!(carried, [Some(heard), None]);
    }

    #[test]
    fn answered_advisory_replaces_the_broadcast_one_at_once() {
        // Arrange: a climb broadcast at 100 s, then a descent answered a second on
        let advising = |downward| Advisory {
            resolution: Some(Resolution {
                corrective: true,
                downward,
                positive: true,
                ..Resolution::default()
            }),
            ..Advisory::default()
        };
        let climb = Report::ResolutionAdvisory(RaBroadcast {
            advisory: advising(false),
        });
        let descent = answered(&Register::ResolutionAdvisory(advising(true)));
        let messages = [(said(climb), 100.0), (said(descent), 101.0)];
        let mut traffic = hearing(messages);

        // Act
        let shown = traffic.snapshot(102.0).aircraft.remove(0).advisory;

        // Assert
        let heard = Advisory {
            heard_ms: 101_000,
            ..advising(true)
        };
        assert_eq!(shown, Some(heard));
    }

    #[test]
    fn callsign_comes_from_the_identification_register_too() {
        // Arrange
        let reports = [here(), answered(&Register::Identification("TEST01".into()))];

        // Act
        let traffic = after(reports);

        // Assert: which says nothing of the category
        let known = known(traffic);
        assert_eq!(known.callsign(), Some("TEST01"));
        assert_eq!(category(&known), None);
    }

    #[test]
    fn registers_fill_in_what_the_broadcasts_leave_out() {
        // Arrange: an aircraft heard in reply only, with both reports
        let heading_and_speed = Register::HeadingAndSpeed(HeadingAndSpeed {
            magnetic_heading_deg: Some(240.0),
            indicated_airspeed_kt: Some(250.0),
            mach: Some(0.78),
            baro_vertical_rate_fpm: Some(-1216),
            inertial_vertical_rate_fpm: Some(-1856),
        });
        let reports = [
            answered(&track_and_turn(225.0, 290.0, 300.0)),
            answered(&heading_and_speed),
        ];

        // Act
        let traffic = after(reports);

        // Assert
        let known = known(traffic);
        let over_ground = (reported(known.track_deg), reported(known.ground_speed_kt));
        assert_eq!(over_ground, (Some(225.0), Some(290.0)));
        let through_air = (
            reported(known.true_airspeed_kt),
            reported(known.indicated_airspeed_kt),
            reported(known.mach),
        );
        assert_eq!(through_air, (Some(300.0), Some(250.0), Some(0.78)));
        let rates = (
            reported(known.baro_vertical_rate_fpm),
            reported(known.geometric_vertical_rate_fpm),
        );
        assert_eq!(rates, (Some(-1216), Some(-1856)));
    }

    #[test]
    fn newest_report_wins_between_reports_of_one_step() {
        // Arrange: the airspeed from the velocity and from the heading and
        // speed report, both in steps of a knot, in either order
        let through_the_air = Report::Velocity(Velocity {
            ground_speed_kt: None,
            track_deg: None,
            airspeed: Some(Airspeed::Indicated(250.0)),
            magnetic_heading_deg: None,
            baro_vertical_rate_fpm: None,
            geometric_vertical_rate_fpm: None,
            geometric_minus_baro_ft: None,
        });
        let report = answered(&Register::HeadingAndSpeed(HeadingAndSpeed {
            magnetic_heading_deg: Some(270.0),
            indicated_airspeed_kt: Some(255.0),
            mach: Some(0.78),
            baro_vertical_rate_fpm: Some(-1216),
            inertial_vertical_rate_fpm: Some(1856),
        }));
        let reports = [
            vec![through_the_air.clone(), report.clone()],
            vec![report, through_the_air],
        ];

        // Act
        let known = reports.map(|reports| known(after(reports)));

        // Assert
        let read = known.map(|a| reported(a.indicated_airspeed_kt));
        assert_eq!(read, [Some(255.0), Some(250.0)]);
    }

    #[test]
    fn finer_report_of_the_last_sweeps_wins_whichever_came_last() {
        // Arrange: the velocity broadcast before the track and turn report,
        // and after it: the speed in steps of a knot against the report's
        // two, the track in steps of 0.2° at that speed against the report's
        // 0.18°
        let report = answered(&track_and_turn(236.25, 300.0, 310.0));
        let reports = [
            vec![velocity(290.0, 235.0), report.clone()],
            vec![report, velocity(290.0, 235.0)],
        ];

        // Act
        let known = reports.map(|reports| known(after(reports)));

        // Assert: the airspeed, which only the report says, stays either way
        let read = known.map(|a| {
            (
                reported(a.ground_speed_kt),
                reported(a.track_deg),
                reported(a.true_airspeed_kt),
            )
        });
        assert_eq!(read, [(Some(290.0), Some(236.25), Some(310.0)); 2]);
    }

    /// The vertical rate in steps of 64 fpm from the velocity at 100 s, in
    /// steps of 32 fpm from the heading and speed report at 101 s, then from
    /// the velocity again at each of the seconds.
    fn rated_at(seconds: impl IntoIterator<Item = f64>) -> Traffic {
        let heading_and_speed = Register::HeadingAndSpeed(HeadingAndSpeed {
            magnetic_heading_deg: Some(240.0),
            indicated_airspeed_kt: Some(250.0),
            mach: Some(0.78),
            baro_vertical_rate_fpm: Some(-1184),
            inertial_vertical_rate_fpm: Some(-1184),
        });
        let again = seconds
            .into_iter()
            .map(|now_s| (said(velocity(290.0, 235.0)), now_s));
        hearing(
            [
                (said(velocity(290.0, 235.0)), 100.0),
                (said(answered(&heading_and_speed)), 101.0),
            ]
            .into_iter()
            .chain(again),
        )
    }

    #[test]
    fn coarser_report_does_not_replace_a_finer_one_of_the_last_sweeps() {
        // Arrange: the velocity again a second after the report
        let mut traffic = rated_at([102.0]);

        // Act
        let carried = traffic
            .snapshot(103.0)
            .aircraft
            .remove(0)
            .baro_vertical_rate_fpm;

        // Assert
        let finer = Int {
            value: -1184,
            heard_ms: 101_000,
        };
        assert_eq!(carried, Some(finer));
    }

    #[test]
    fn coarser_report_replaces_a_finer_one_once_the_sweeps_have_passed() {
        // Arrange: the velocity again within the sweeps, and beyond them
        let mut traffic = rated_at([102.0, 117.0]);

        // Act
        let carried = traffic
            .snapshot(118.0)
            .aircraft
            .remove(0)
            .baro_vertical_rate_fpm;

        // Assert
        let coarser = Int {
            value: -1216,
            heard_ms: 117_000,
        };
        assert_eq!(carried, Some(coarser));
    }

    #[test]
    fn register_fills_in_once_the_broadcast_lapses() {
        // Arrange: a velocity, then a report more than a minute later
        let messages = [
            (said(velocity(290.0, 235.0)), 100.0),
            (said(answered(&track_and_turn(270.0, 300.0, 310.0))), 170.0),
        ];

        // Act
        let mut traffic = hearing(messages);

        // Assert
        let known = traffic.snapshot(171.0).aircraft.remove(0);
        assert_eq!(
            (reported(known.ground_speed_kt), reported(known.track_deg)),
            (Some(300.0), Some(270.0))
        );
    }

    #[test]
    fn selected_intention_register_replaces_the_target_state_field_by_field() {
        // Arrange: an aircraft that only answers with it, and one that also
        // broadcasts a target state without the barometric setting
        let intention = TargetState {
            selected_altitude_mcp_ft: Some(6000),
            baro_setting_hpa: Some(1013.6),
            ..TargetState::default()
        };
        let answered = answered(&Register::SelectedVerticalIntention(
            SelectedVerticalIntention { target: intention },
        ));
        let broadcast = TargetState {
            selected_altitude_mcp_ft: Some(5024),
            selected_heading_deg: Some(270.0),
            ..TargetState::default()
        };
        let target_state = Report::TargetStateAndStatus(TargetStateAndStatus {
            target: broadcast,
            nac_p: 9,
        });
        let reports = [vec![here(), answered.clone()], vec![target_state, answered]];

        // Act
        let known = reports.map(|reports| known(after(reports)));

        // Assert: the reply, which came last, wins the altitude and adds the
        // setting; the heading, which it leaves out, stays
        let expected = [
            (Some(6000), None, None, Some(1013.6)),
            (Some(6000), None, Some(270.0), Some(1013.6)),
        ];
        assert_eq!(known.map(|a| selected(&a)), expected);
    }

    #[test]
    fn selected_intention_register_leaves_the_modes_it_does_not_carry() {
        // Arrange: every mode engaged in the broadcast, then the register
        // with VNAV off
        let engaged = Modes {
            autopilot: true,
            vnav: true,
            altitude_hold: true,
            approach: true,
            lnav: true,
            tcas: true,
            ..Modes::default()
        };
        let broadcast = Report::TargetStateAndStatus(TargetStateAndStatus {
            target: TargetState {
                modes: engaged.into(),
                ..TargetState::default()
            },
            nac_p: 9,
        });
        let intention = TargetState {
            modes: ModesReported {
                vnav: Some(false),
                altitude_hold: Some(true),
                approach: Some(true),
                ..ModesReported::default()
            },
            ..TargetState::default()
        };
        let answered = answered(&Register::SelectedVerticalIntention(
            SelectedVerticalIntention { target: intention },
        ));

        // Act
        let traffic = after([broadcast, answered]);

        // Assert: the reply's three as it says them, heard with it; the
        // broadcast's others as they were
        let expected = Modes {
            vnav: false,
            heard_ms: 101_000,
            ..engaged
        };
        assert_eq!(known(traffic).modes, Some(expected));
    }

    #[test]
    fn register_of_two_layouts_is_read_by_what_the_aircraft_broadcast() {
        // Arrange: a field that is a track and turn report at 240 kt on 239°
        // or a heading and speed one at Mach 0.48, from an aircraft heard on
        // 239° at 240 kt
        let both = Report::Reply(Reply {
            comm_b: Some(Bits::of(&[0xff, 0xba, 0xa1, 0x1e, 0x20, 0x04, 0x72])),
            ..Reply::default()
        });

        // Act
        let traffic = after([velocity(240.0, 239.0), both]);

        // Assert
        let known = known(traffic);
        assert_eq!(
            (reported(known.true_airspeed_kt), reported(known.mach)),
            (Some(228.0), None)
        );
    }

    #[test]
    fn wind_and_air_temperature_are_derived_from_the_reports() {
        // Arrange: east at 480 kt over the ground and 450 kt through the air
        // on the same heading, which the report carries as magnetic
        let now_s = 1_780_000_000.0;
        let magnetic = 90.0 - SITE.declination_deg(now_s);
        let heading_and_speed = Register::HeadingAndSpeed(HeadingAndSpeed {
            magnetic_heading_deg: Some(magnetic),
            mach: Some(0.78),
            ..HeadingAndSpeed::default()
        });
        let messages = [
            (said(velocity(480.0, 90.0)), now_s),
            (
                said(answered(&track_and_turn(90.0, 480.0, 450.0))),
                now_s + 1.0,
            ),
            (said(answered(&heading_and_speed)), now_s + 2.0),
        ];

        // Act
        let mut traffic = hearing(messages);

        // Assert: a tail wind of 30 kt, and the temperature that Mach 0.78
        // at 450 kt stands for, to the step the heading is sent in
        let known = traffic.snapshot(now_s + 3.0).aircraft.remove(0);
        let [wind_dir, wind_speed, oat, tat] = derived(&known);
        let near = |value: Option<f64>, expected: f64, within: f64| {
            value.is_some_and(|value| (value - expected).abs() < within)
        };
        assert!(near(wind_dir, 270.0, 2.0), "{known:?}");
        assert!(near(wind_speed, 30.0, 1.0), "{known:?}");
        assert!(near(oat, -53.96, 0.05), "{known:?}");
        assert!(near(tat, -27.29, 0.05), "{known:?}");
    }

    #[test]
    fn wind_is_not_derived_while_the_aircraft_turns() {
        // Arrange: the track and turn report says it turns at 2° a second
        let now_s = 1_780_000_000.0;
        let turning = Register::TrackAndTurn(TrackAndTurn {
            track_rate_deg_per_s: Some(2.0),
            ..match track_and_turn(90.0, 480.0, 450.0) {
                Register::TrackAndTurn(report) => report,
                other => panic!("{other:?}"),
            }
        });
        let heading_and_speed = Register::HeadingAndSpeed(HeadingAndSpeed {
            magnetic_heading_deg: Some(97.0),
            mach: Some(0.78),
            ..HeadingAndSpeed::default()
        });
        let messages = [
            (said(velocity(480.0, 90.0)), now_s),
            (said(answered(&turning)), now_s + 1.0),
            (said(answered(&heading_and_speed)), now_s + 2.0),
        ];

        // Act
        let mut traffic = hearing(messages);

        // Assert: the temperature is derived all the same
        let known = traffic.snapshot(now_s + 3.0).aircraft.remove(0);
        let [_, wind, oat, _] = derived(&known);
        assert_eq!(wind, None);
        assert!(oat.is_some());
    }

    #[test]
    fn wind_pairs_the_heading_with_an_airspeed_of_the_same_sweep() {
        // Arrange: the heading four seconds before the airspeed, more than a sweep apart
        let now_s = 1_780_000_000.0;
        let heading_and_speed = Register::HeadingAndSpeed(HeadingAndSpeed {
            magnetic_heading_deg: Some(97.0),
            mach: Some(0.78),
            ..HeadingAndSpeed::default()
        });
        let messages = [
            (said(velocity(480.0, 90.0)), now_s),
            (said(answered(&heading_and_speed)), now_s + 1.0),
            (
                said(answered(&track_and_turn(90.0, 480.0, 450.0))),
                now_s + 5.0,
            ),
        ];

        // Act
        let mut traffic = hearing(messages);

        // Assert: the temperature is derived all the same
        let known = traffic.snapshot(now_s + 6.0).aircraft.remove(0);
        let [_, wind, oat, _] = derived(&known);
        assert_eq!(wind, None);
        assert!(oat.is_some());
    }

    #[test]
    fn wind_pairs_the_ground_vector_with_an_air_vector_of_the_same_sweep() {
        // Arrange: the track and ground speed five seconds before the
        // heading, more than a sweep apart; the airspeed within one
        let now_s = 1_780_000_000.0;
        let through_the_air = Report::Velocity(Velocity {
            ground_speed_kt: None,
            track_deg: None,
            airspeed: Some(Airspeed::True(450.0)),
            magnetic_heading_deg: None,
            baro_vertical_rate_fpm: None,
            geometric_vertical_rate_fpm: None,
            geometric_minus_baro_ft: None,
        });
        let heading_and_speed = Register::HeadingAndSpeed(HeadingAndSpeed {
            magnetic_heading_deg: Some(97.0),
            mach: Some(0.78),
            ..HeadingAndSpeed::default()
        });
        let messages = [
            (said(velocity(480.0, 90.0)), now_s),
            (said(through_the_air), now_s + 4.0),
            (said(answered(&heading_and_speed)), now_s + 5.0),
        ];

        // Act
        let mut traffic = hearing(messages);

        // Assert: the temperature is derived all the same
        let known = traffic.snapshot(now_s + 6.0).aircraft.remove(0);
        let [_, wind, oat, _] = derived(&known);
        assert_eq!(wind, None);
        assert!(oat.is_some());
    }

    #[test]
    fn derived_value_lapses_with_the_oldest_of_its_inputs() {
        // Arrange: the Mach number at 100 s, the airspeed the temperature is
        // derived from it with at 112 s
        let heading_and_speed = Register::HeadingAndSpeed(HeadingAndSpeed {
            mach: Some(0.78),
            ..HeadingAndSpeed::default()
        });
        let messages = [
            (said(velocity(480.0, 90.0)), 100.0),
            (said(answered(&heading_and_speed)), 100.0),
            (said(answered(&track_and_turn(90.0, 480.0, 450.0))), 112.0),
        ];
        let mut traffic = hearing(messages);

        // Act: just short of a minute after the Mach number, and a minute after it
        let derived = [159.9, 160.0].map(|now_s| {
            let known = traffic.snapshot(now_s).aircraft.remove(0);
            (reported(known.true_airspeed_kt), reported(known.oat_c))
        });

        // Assert: the airspeed, said later, is still known
        let lapsed = derived.map(|(airspeed, oat)| (airspeed.is_some(), oat.is_some()));
        assert_eq!(lapsed, [(true, true), (true, false)]);
    }

    #[test]
    fn derived_value_is_heard_when_the_oldest_of_its_inputs_was() {
        // Arrange: the Mach number at 100 s, the airspeed at 112 s
        let heading_and_speed = Register::HeadingAndSpeed(HeadingAndSpeed {
            mach: Some(0.78),
            ..HeadingAndSpeed::default()
        });
        let messages = [
            (said(velocity(480.0, 90.0)), 100.0),
            (said(answered(&heading_and_speed)), 100.0),
            (said(answered(&track_and_turn(90.0, 480.0, 450.0))), 112.0),
        ];
        let mut traffic = hearing(messages);

        // Act
        let heard = [113.0, 150.0].map(|now_s| {
            let known = traffic.snapshot(now_s).aircraft.remove(0);
            known.oat_c.map(|oat| oat.heard_ms)
        });

        // Assert: and keeps that instant while neither is heard again
        assert_eq!(heard, [Some(100_000), Some(100_000)]);
    }

    #[test]
    fn air_data_said_more_than_a_sweep_or_two_apart_derive_nothing() {
        // Arrange: the heading and the Mach number twenty seconds before the airspeed
        let now_s = 1_780_000_000.0;
        let heading_and_speed = Register::HeadingAndSpeed(HeadingAndSpeed {
            magnetic_heading_deg: Some(97.0),
            mach: Some(0.78),
            ..HeadingAndSpeed::default()
        });
        let messages = [
            (said(velocity(480.0, 90.0)), now_s),
            (said(answered(&heading_and_speed)), now_s + 1.0),
            (
                said(answered(&track_and_turn(90.0, 480.0, 450.0))),
                now_s + 21.0,
            ),
        ];

        // Act
        let mut traffic = hearing(messages);

        // Assert
        let known = traffic.snapshot(now_s + 22.0).aircraft.remove(0);
        assert_eq!(derived(&known), [None; 4]);
    }
}
