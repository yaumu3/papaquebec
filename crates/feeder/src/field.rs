//! The message fields of extended squitters, each read and written in one place.
//!
//! They are laid out as in RTCA DO-260B. What a field carries beyond what is
//! read here is written as zeros.

use crate::bits::Bits;
use crate::cpr::Cpr;
use crate::proto::{EmergencyPriorityStatus, EmitterCategory, TargetState, target_state::Modes};

/// The 56 bits an extended squitter carries of one kind of message.
pub trait Field: Sized {
    /// What the bits say; none when they are of another kind of message.
    fn read(me: Bits) -> Option<Self>;

    #[must_use]
    fn write(&self) -> Bits;
}

const ME_LEN: u32 = 56;

/// Aircraft Identification and Category message.
#[derive(Clone, Debug, PartialEq)]
pub struct Identification {
    /// None when blank or not in the message's alphabet.
    pub identification: Option<String>,
    pub emitter_category: EmitterCategory,
}

/// The characters by their codes; `#` where none is assigned.
const ALPHABET: &[u8; 64] = b"#ABCDEFGHIJKLMNOPQRSTUVWXYZ##### ###############0123456789######";
const BLANK: u32 = 32;

impl Field for Identification {
    fn read(me: Bits) -> Option<Self> {
        // Type codes 4 down to 1 are the category sets A to D.
        let set = 4_u32.checked_sub(me.get(1, 5)).filter(|set| *set < 4)?;
        let characters = (0..8).map(|at| ALPHABET[me.get(9 + 6 * at, 14 + 6 * at) as usize]);
        let callsign: String = characters.map(char::from).collect();
        // Left-justified by the standard, which not every transponder keeps to.
        let callsign = callsign.trim();
        let readable = !callsign.is_empty() && !callsign.contains('#');
        let category = i32::try_from(set * 8 + me.get(6, 8)).ok()?;
        Some(Self {
            identification: readable.then(|| callsign.to_owned()),
            emitter_category: EmitterCategory::try_from(category).ok()?,
        })
    }

    fn write(&self) -> Bits {
        let category = u32::try_from(i32::from(self.emitter_category)).unwrap_or(0);
        let callsign = self.identification.as_deref().unwrap_or("");
        let code = |character: u8| {
            let assigned = ALPHABET.iter().position(|known| *known == character);
            assigned.and_then(|code| u32::try_from(code).ok())
        };
        let codes = callsign
            .bytes()
            .map(|character| code(character).unwrap_or(BLANK));
        let head = Bits::default()
            .put(4 - category / 8, 5)
            .put(category % 8, 3);
        let written = codes.take(8).fold(head, |bits, code| bits.put(code, 6));
        // What is left of the eight characters is blank.
        (written.len()..ME_LEN)
            .step_by(6)
            .fold(written, |bits, _| bits.put(BLANK, 6))
    }
}

/// Airborne Position message.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AirbornePosition {
    pub cpr: Cpr,
    /// Pressure altitude, which type codes 9 to 18 carry.
    pub baro_altitude_ft: Option<i32>,
    /// GNSS height, which type codes 20 to 22 carry instead.
    pub geometric_altitude_ft: Option<i32>,
    pub type_code: u32,
    pub nic_supplement_b: bool,
}

impl AirbornePosition {
    /// Whether the type code is one of those that carry the GNSS height.
    fn by_gnss(type_code: u32) -> bool {
        type_code >= 20
    }

    /// The Navigation Integrity Category of the position, given the NIC
    /// supplement A and the ADS-B version that the aircraft reports in its
    /// operational status.
    #[must_use]
    pub fn nic(&self, supplement_a: bool, version: u32) -> u32 {
        // Before version 2 the bit of supplement B says something else.
        nic(
            self.type_code,
            supplement_a,
            version >= 2 && self.nic_supplement_b,
        )
    }

    /// The Navigation Accuracy Category for position that the message stands
    /// for when it is from an aircraft of ADS-B version 0, which reports none.
    #[must_use]
    pub fn nac_p_of_version_0(&self) -> u32 {
        version_0_nac_p(self.type_code)
    }
}

impl Field for AirbornePosition {
    fn read(me: Bits) -> Option<Self> {
        let type_code = Some(me.get(1, 5)).filter(|code| matches!(code, 9..=18 | 20..=22))?;
        // The 12 bits are an altitude code without its M bit.
        let code = me.get(9, 20);
        let altitude = altitude(code << 1 & 0x1f80 | code & 0x3f);
        let by_gnss = Self::by_gnss(type_code);
        Some(Self {
            cpr: position(me),
            baro_altitude_ft: altitude.filter(|_| !by_gnss),
            geometric_altitude_ft: altitude.filter(|_| by_gnss),
            type_code,
            nic_supplement_b: me.flag(8),
        })
    }

    fn write(&self) -> Bits {
        let altitude = if Self::by_gnss(self.type_code) {
            self.geometric_altitude_ft
        } else {
            self.baro_altitude_ft
        };
        // In steps of 25 ft from -1000 ft, around the Q bit that says so.
        let steps = altitude.map(|ft| u32::try_from((ft + 1012).div_euclid(25)).unwrap_or(0));
        let code = steps.map_or(0, |steps| (steps & 0x7f0) << 1 | 0x10 | steps & 0xf);
        let head = Bits::default()
            .put(self.type_code, 5)
            // Surveillance status
            .put(0, 2)
            .put_flag(self.nic_supplement_b)
            .put(code, 12);
        head.then(positioned(self.cpr))
    }
}

/// Surface Position message.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SurfacePosition {
    pub cpr: Cpr,
    pub ground_speed_kt: Option<f64>,
    /// True track over the ground.
    pub track_deg: Option<f64>,
    pub type_code: u32,
}

/// The movement codes, whose steps widen with the ground speed: the first
/// code of each range, its speed in kt and the step in kt.
const MOVEMENT: [(u32, f64, f64); 8] = [
    (124, 175.0, 0.0),
    (109, 100.0, 5.0),
    (94, 70.0, 2.0),
    (39, 15.0, 1.0),
    (13, 2.0, 0.5),
    (9, 1.0, 0.25),
    (2, 0.125, 0.125),
    (1, 0.0, 0.0),
];

impl Field for SurfacePosition {
    fn read(me: Bits) -> Option<Self> {
        let type_code = Some(me.get(1, 5)).filter(|code| (5..=8).contains(code))?;
        let movement = me.get(6, 12);
        let range = MOVEMENT.iter().find(|(first, ..)| movement >= *first);
        let speed = range.map(|(first, speed, step)| speed + f64::from(movement - first) * step);
        Some(Self {
            cpr: position(me),
            ground_speed_kt: speed.filter(|_| movement <= 124),
            track_deg: me
                .flag(13)
                .then(|| f64::from(me.get(14, 20)) * 360.0 / 128.0),
            type_code,
        })
    }

    fn write(&self) -> Bits {
        let movement = self.ground_speed_kt.map_or(0, |speed| {
            let range = MOVEMENT.iter().find(|(_, from, _)| speed >= *from);
            // A range without a step is a single code.
            range.map_or(1, |(first, from, step)| {
                let into = ((speed - from) / step).floor();
                first + if into.is_finite() { count(into) } else { 0 }
            })
        });
        let track = self
            .track_deg
            .map_or(0, |track| count(track * 128.0 / 360.0));
        let head = Bits::default()
            .put(self.type_code, 5)
            .put(movement, 7)
            .put_flag(self.track_deg.is_some())
            .put(track, 7);
        head.then(positioned(self.cpr))
    }
}

impl SurfacePosition {
    /// The Navigation Integrity Category of the position, given the NIC
    /// supplements A and C that the aircraft reports in its operational status.
    #[must_use]
    pub fn nic(&self, supplement_a: bool, supplement_c: bool) -> u32 {
        nic(self.type_code, supplement_a, supplement_c)
    }

    /// The Navigation Accuracy Category for position that the message stands
    /// for when it is from an aircraft of ADS-B version 0, which reports none.
    #[must_use]
    pub fn nac_p_of_version_0(&self) -> u32 {
        version_0_nac_p(self.type_code)
    }
}

/// The position in the last 35 bits of both position messages, after the time bit.
fn position(me: Bits) -> Cpr {
    Cpr {
        odd: me.flag(22),
        lat: me.get(23, 39),
        lon: me.get(40, 56),
    }
}

/// The last 36 bits of both position messages: the time bit, then the position.
fn positioned(cpr: Cpr) -> Bits {
    Bits::default()
        .put_flag(false)
        .put_flag(cpr.odd)
        .put(cpr.lat, 17)
        .put(cpr.lon, 17)
}

/// The Navigation Accuracy Category for position of an aircraft of ADS-B
/// version 0, which reports none: the one the type code of its position
/// message stands for (EUROCAE ED-102A and RTCA DO-260B, Appendix N, Table N-7).
fn version_0_nac_p(type_code: u32) -> u32 {
    match type_code {
        5 | 9 | 20 => 11,
        6 | 10 | 21 => 10,
        7 | 11 => 8,
        12 => 7,
        13 => 6,
        14 => 5,
        15 => 4,
        16 | 17 => 1,
        _ => 0,
    }
}

/// The Navigation Integrity Category of a position, which DO-260B assigns by
/// the type code of its message and the NIC supplements the aircraft reports:
/// A, with B in the air or C on the ground.
fn nic(type_code: u32, supplement_a: bool, supplement_b_or_c: bool) -> u32 {
    match (type_code, supplement_a, supplement_b_or_c) {
        (5 | 9 | 20, ..) => 11,
        (6 | 10 | 21, ..) => 10,
        (7, true, false) | (11, true, true) => 9,
        (7 | 11, ..) => 8,
        (8, true, true) | (12, ..) => 7,
        (8, true, false) | (8, false, true) | (13, ..) => 6,
        (14, ..) => 5,
        (15, ..) => 4,
        (16, true, true) => 3,
        (16, ..) => 2,
        (17, ..) => 1,
        _ => 0,
    }
}

/// Airborne Velocity message.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Velocity {
    /// Over the ground, with the true track it is made along.
    pub ground_speed_kt: Option<f64>,
    pub track_deg: Option<f64>,
    /// Through the air, sent in place of the speed over the ground.
    pub airspeed: Option<Airspeed>,
    /// The vertical rate is the one or the other, as the message says.
    pub baro_vertical_rate_fpm: Option<i32>,
    pub geometric_vertical_rate_fpm: Option<i32>,
    /// How far the GNSS height is above the barometric altitude.
    pub geometric_minus_baro_ft: Option<i32>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Airspeed {
    Indicated(f64),
    True(f64),
}

/// The speeds above which a velocity is sent in the steps of 4 kt of the
/// supersonic subtypes: the most the steps of 1 kt count.
const SUBSONIC_KT: f64 = 1021.0;

impl Field for Velocity {
    fn read(me: Bits) -> Option<Self> {
        if me.get(1, 5) != 19 {
            return None;
        }
        let subtype = me.get(6, 8);
        // Subtypes 2 and 4 are the supersonic ones.
        let step = match subtype {
            1 | 3 => 1.0,
            2 | 4 => 4.0,
            _ => return None,
        };
        let over_ground = (subtype <= 2).then(|| over_ground(me, step)).flatten();
        let rate = stepped(me.flag(37), me.get(38, 46), 64);
        Some(Self {
            ground_speed_kt: over_ground.map(|(speed, _)| speed),
            track_deg: over_ground.map(|(_, track)| track),
            airspeed: (subtype >= 3).then(|| airspeed(me, step)).flatten(),
            // The source bit is set for a barometric rate.
            baro_vertical_rate_fpm: rate.filter(|_| me.flag(36)),
            geometric_vertical_rate_fpm: rate.filter(|_| !me.flag(36)),
            geometric_minus_baro_ft: stepped(me.flag(49), me.get(50, 56), 25),
        })
    }

    fn write(&self) -> Bits {
        let (subtype, speeds) = match self.airspeed {
            Some(airspeed) => through_air(airspeed),
            None => along_ground(self.ground_speed_kt.zip(self.track_deg)),
        };
        let rate = self
            .baro_vertical_rate_fpm
            .or(self.geometric_vertical_rate_fpm);
        let (down, rate) = steps(rate, 64);
        let (below, difference) = steps(self.geometric_minus_baro_ft, 25);
        Bits::default()
            .put(19, 5)
            .put(subtype, 3)
            // Intent change, IFR capability and NACv
            .put(0, 5)
            .then(speeds)
            .put_flag(self.baro_vertical_rate_fpm.is_some())
            .put_flag(down)
            .put(rate, 9)
            .put(0, 2)
            .put_flag(below)
            .put(difference, 7)
    }
}

/// A magnitude counted in steps from 1, zero standing for no information.
fn stepped(negative: bool, count: u32, step: i32) -> Option<i32> {
    let magnitude = i32::try_from(count.checked_sub(1)?).ok()? * step;
    Some(if negative { -magnitude } else { magnitude })
}

/// Whether the value is negative, and its magnitude counted in steps from 1.
fn steps(value: Option<i32>, step: u32) -> (bool, u32) {
    value.map_or((false, 0), |value| {
        (value < 0, (value.unsigned_abs() + step / 2) / step + 1)
    })
}

/// Ground speed and true track, from the velocities to the east and to the north.
fn over_ground(me: Bits, step: f64) -> Option<(f64, f64)> {
    let east = f64::from(stepped(me.flag(14), me.get(15, 24), 1)?) * step;
    let north = f64::from(stepped(me.flag(25), me.get(26, 35), 1)?) * step;
    let track = east.atan2(north).to_degrees().rem_euclid(360.0);
    Some((east.hypot(north), track))
}

/// The subtype and the 22 bits of a ground speed along a track, as the
/// velocities to the east and to the north; of none, not available.
fn along_ground(velocity: Option<(f64, f64)>) -> (u32, Bits) {
    let Some((speed, track)) = velocity else {
        return (1, Bits::default().filled(22));
    };
    let (east, north) = (
        speed * track.to_radians().sin(),
        speed * track.to_radians().cos(),
    );
    let supersonic = east.abs().max(north.abs()) > SUBSONIC_KT;
    let step = if supersonic { 4.0 } else { 1.0 };
    let toward = |velocity: f64| {
        Bits::default()
            .put_flag(velocity < 0.0)
            .put(count(velocity.abs() / step) + 1, 10)
    };
    (1 + u32::from(supersonic), toward(east).then(toward(north)))
}

fn airspeed(me: Bits, step: f64) -> Option<Airspeed> {
    let speed = f64::from(me.get(26, 35).checked_sub(1)?) * step;
    Some(if me.flag(25) {
        Airspeed::True(speed)
    } else {
        Airspeed::Indicated(speed)
    })
}

/// The subtype and the 22 bits of an airspeed, without the heading that goes with it.
fn through_air(airspeed: Airspeed) -> (u32, Bits) {
    let (is_true, speed) = match airspeed {
        Airspeed::Indicated(speed) => (false, speed),
        Airspeed::True(speed) => (true, speed),
    };
    let supersonic = speed > SUBSONIC_KT;
    let step = if supersonic { 4.0 } else { 1.0 };
    let bits = Bits::default()
        .put(0, 11)
        .put_flag(is_true)
        .put(count(speed / step) + 1, 10);
    (3 + u32::from(supersonic), bits)
}

/// Aircraft Status message, of the emergency/priority status subtype.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Status {
    pub emergency_priority_status: EmergencyPriorityStatus,
    /// None when the message carries no code.
    pub mode_a_code: Option<u32>,
}

impl Field for Status {
    fn read(me: Bits) -> Option<Self> {
        // Subtype 1 is the emergency/priority status.
        if me.get(1, 5) != 28 || me.get(6, 8) != 1 {
            return None;
        }
        let status = i32::try_from(me.get(9, 11)).ok()?;
        Some(Self {
            emergency_priority_status: EmergencyPriorityStatus::try_from(status).ok()?,
            mode_a_code: Some(me.get(12, 24))
                .filter(|identity| *identity != 0)
                .map(mode_a_code),
        })
    }

    fn write(&self) -> Bits {
        let status = u32::try_from(i32::from(self.emergency_priority_status)).unwrap_or(0);
        Bits::default()
            .put(28, 5)
            .put(1, 3)
            .put(status, 3)
            .put(self.mode_a_code.map_or(0, identity), 13)
            .filled(ME_LEN)
    }
}

/// Where the pulses 4, 2 and 1 of the digits A, B, C and D of a Mode A code
/// lie in a 13-bit identity code, from its last bit: they are interleaved as
/// C1 A1 C2 A2 C4 A4 - B1 D1 B2 D2 B4 D4.
const PULSES: [u32; 12] = [7, 9, 11, 1, 3, 5, 8, 10, 12, 0, 2, 4];

/// The Mode A code of a 13-bit identity code.
pub(crate) fn mode_a_code(identity: u32) -> u32 {
    let pulses = PULSES.iter().map(|pulse| identity >> pulse & 1);
    pulses.fold(0, |code, pulse| code << 1 | pulse)
}

/// The 13-bit identity code of a Mode A code.
fn identity(mode_a_code: u32) -> u32 {
    let pulses = PULSES.iter().rev().zip(0..);
    pulses.fold(0, |identity, (pulse, bit)| {
        identity | (mode_a_code >> bit & 1) << pulse
    })
}

/// Target State and Status message, of ADS-B version 2.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TargetStateAndStatus {
    pub target: TargetState,
    /// Navigation Accuracy Category for position, 0 to 11.
    pub nac_p: u32,
}

impl Field for TargetStateAndStatus {
    fn read(me: Bits) -> Option<Self> {
        // Subtype 1 is the layout of ADS-B version 2.
        if me.get(1, 5) != 29 || me.get(6, 7) != 1 {
            return None;
        }
        // Zero is no data; the first step follows it.
        let steps = |first, last| me.get(first, last).checked_sub(1);
        let altitude = steps(10, 20).and_then(|steps| i32::try_from(steps * 32).ok());
        let from_fms = me.flag(9);
        let modes = me.flag(47).then(|| Modes {
            autopilot: me.flag(48),
            vnav: me.flag(49),
            altitude_hold: me.flag(50),
            approach: me.flag(52),
            tcas: me.flag(53),
            lnav: me.flag(54),
        });
        let target = TargetState {
            selected_altitude_mcp_ft: altitude.filter(|_| !from_fms),
            selected_altitude_fms_ft: altitude.filter(|_| from_fms),
            selected_heading_deg: me
                .flag(30)
                .then(|| f64::from(me.get(31, 39)) * 180.0 / 256.0),
            // In steps of 0.8 hPa from 800 hPa.
            baro_setting_hpa: steps(21, 29).map(|steps| f64::from(8000 + steps * 8) / 10.0),
            modes,
        };
        Some(Self {
            target,
            nac_p: me.get(40, 43),
        })
    }

    fn write(&self) -> Bits {
        let target = &self.target;
        let from_fms = target.selected_altitude_fms_ft.is_some();
        let altitude = target
            .selected_altitude_fms_ft
            .or(target.selected_altitude_mcp_ft);
        let modes = target.modes.unwrap_or_default();
        // Zero is no data; the first step follows it.
        let stepped = |value: Option<f64>| value.map_or(0, |steps| count(steps) + 1);
        Bits::default()
            .put(29, 5)
            // Subtype 1, and the SIL supplement
            .put(0b010, 3)
            .put_flag(from_fms)
            .put(stepped(altitude.map(|ft| f64::from(ft) / 32.0)), 11)
            .put(
                stepped(target.baro_setting_hpa.map(|hpa| (hpa - 800.0) / 0.8)),
                9,
            )
            .put_flag(target.selected_heading_deg.is_some())
            .put(
                count(target.selected_heading_deg.unwrap_or(0.0) * 256.0 / 180.0),
                9,
            )
            .put(self.nac_p, 4)
            // NIC baro and SIL
            .put(0, 3)
            .put_flag(target.modes.is_some())
            .put_flag(modes.autopilot)
            .put_flag(modes.vnav)
            .put_flag(modes.altitude_hold)
            // Reserved for the rebroadcast flag
            .put_flag(false)
            .put_flag(modes.approach)
            .put_flag(modes.tcas)
            .put_flag(modes.lnav)
            .filled(ME_LEN)
    }
}

/// Aircraft Operational Status message.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct OperationalStatus {
    /// Whether it is of the subtype an aircraft sends on the ground.
    pub on_ground: bool,
    /// The ADS-B version the aircraft broadcasts in.
    pub version: u32,
    pub nic_supplement_a: bool,
    /// Sent on the ground only.
    pub nic_supplement_c: bool,
    /// None from version 0, which has no such field.
    pub nac_p: Option<u32>,
}

impl Field for OperationalStatus {
    fn read(me: Bits) -> Option<Self> {
        // Subtype 0 is sent in the air and 1 on the ground.
        let subtype = Some(me.get(6, 8)).filter(|subtype| *subtype <= 1)?;
        if me.get(1, 5) != 31 {
            return None;
        }
        let (on_ground, version) = (subtype == 1, me.get(41, 43));
        Some(Self {
            on_ground,
            version,
            nic_supplement_a: version >= 1 && me.flag(44),
            nic_supplement_c: version >= 2 && on_ground && me.flag(20),
            nac_p: (version >= 1).then(|| me.get(45, 48)),
        })
    }

    fn write(&self) -> Bits {
        Bits::default()
            .put(31, 5)
            .put(u32::from(self.on_ground), 3)
            // The capability class codes, the last of which on the ground is supplement C
            .put(0, 11)
            .put_flag(self.nic_supplement_c)
            // What is left of them, and the operational mode codes
            .put(0, 4 + 16)
            .put(self.version, 3)
            .put_flag(self.nic_supplement_a)
            .put(self.nac_p.unwrap_or(0), 4)
            .filled(ME_LEN)
    }
}

/// The altitude in feet of a 13-bit altitude code; none when it carries none
/// or counts in metres.
pub(crate) fn altitude(code: u32) -> Option<i32> {
    const M: u32 = 0x40;
    const Q: u32 = 0x10;
    if code == 0 || code & M != 0 {
        return None;
    }
    if code & Q == 0 {
        return gillham(code);
    }
    // With Q set the other bits count steps of 25 ft from -1000 ft.
    let steps = (code & 0x1f80) >> 2 | (code & 0x20) >> 1 | code & 0xf;
    Some(i32::try_from(steps).ok()? * 25 - 1000)
}

/// The altitude in feet of a Gillham code, the pulses of a Mode C reply:
/// D2 D4 A1 A2 A4 B1 B2 B4 count 500 ft in Gray code, and C1 C2 C4 count the
/// 100 ft within, up and then back down.
fn gillham(code: u32) -> Option<i32> {
    // The pulses lie in the code as C1 A1 C2 A2 C4 A4 M B1 Q B2 D2 B4 D4.
    const FIVE_HUNDREDS: [u32; 8] = [2, 0, 11, 9, 7, 5, 3, 1];
    const HUNDREDS: [u32; 3] = [12, 10, 8];
    let binary = |pulses: &[u32]| {
        let gray = pulses.iter().map(|pulse| code >> pulse & 1);
        let bits = gray.scan(0, |bit, pulse| {
            *bit ^= pulse;
            Some(*bit)
        });
        bits.fold(0, |value, bit| value << 1 | bit)
    };
    let five_hundreds = i32::try_from(binary(&FIVE_HUNDREDS)).ok()?;
    let within = match binary(&HUNDREDS) {
        7 => 5,
        within @ 1..=4 => i32::try_from(within).ok()?,
        _ => return None,
    };
    let hundreds = if five_hundreds % 2 == 0 {
        within
    } else {
        6 - within
    };
    Some(five_hundreds * 500 + hundreds * 100 - 1300)
}

/// Rounded to a count; nothing below zero.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn count(value: f64) -> u32 {
    value.round().max(0.0) as u32
}

#[cfg(test)]
mod tests {
    use super::{
        AirbornePosition, Airspeed, Field, Identification, OperationalStatus, Status,
        SurfacePosition, TargetStateAndStatus, Velocity, nic, version_0_nac_p,
    };
    use crate::bits::Bits;
    use crate::cpr::Cpr;
    use crate::proto::{
        EmergencyPriorityStatus, EmitterCategory, TargetState, target_state::Modes,
    };

    /// The message field of a published extended squitter.
    fn published(hex: &str) -> Bits {
        let digits = |at| u8::from_str_radix(&hex[at..at + 2], 16).expect("hexadecimal");
        let message: Vec<u8> = (0..hex.len()).step_by(2).map(digits).collect();
        Bits::of(&message).field(33, 88)
    }

    /// The message field with its bits `first` to `last` replaced.
    fn with(me: Bits, first: u32, last: u32, value: u32) -> Bits {
        let after = if last < 56 {
            me.field(last + 1, 56)
        } else {
            Bits::default()
        };
        let before = if first > 1 {
            me.field(1, first - 1)
        } else {
            Bits::default()
        };
        before.put(value, last - first + 1).then(after)
    }

    /// What is read of a field of one kind and written again.
    type Rewritten = fn(Bits) -> Option<Bits>;

    fn rewritten<F: Field>(me: Bits) -> Option<Bits> {
        F::read(me).map(|field| field.write())
    }

    /// What is written of a field and read again.
    fn reread<F: Field>(field: &F) -> Option<F> {
        F::read(field.write())
    }

    const CPR: Cpr = Cpr {
        odd: true,
        lat: 93_000,
        lon: 51_372,
    };

    #[test]
    fn published_messages_are_written_back_as_they_were_read() {
        // Arrange: "The 1090 Megahertz Riddle": identification, both airborne
        // positions, a surface position, velocity over the ground and through the
        // air; then the status and the target state in the tests of pyModeS
        let fields: [(&str, Rewritten); 8] = [
            ("8D4840D6202CC371C32CE0576098", rewritten::<Identification>),
            (
                "8D40621D58C382D690C8AC2863A7",
                rewritten::<AirbornePosition>,
            ),
            (
                "8D40621D58C386435CC412692AD6",
                rewritten::<AirbornePosition>,
            ),
            ("8C4841753A9A153237AEF0F275BE", rewritten::<SurfacePosition>),
            ("8D485020994409940838175B284F", rewritten::<Velocity>),
            ("8DA05F219B06B6AF189400CBC33F", rewritten::<Velocity>),
            ("8DA2C1B6E112B600000000760759", rewritten::<Status>),
            (
                "8DA05629EA21485CBF3F8CADAEEB",
                rewritten::<TargetStateAndStatus>,
            ),
        ];

        // Act
        let written = fields.map(|(hex, rewritten)| rewritten(published(hex)));

        // Assert: but for what is not read, which is written as zeros: the IFR
        // capability of the first velocity, the heading of the second, and the
        // NIC baro and SIL of the target state
        let expected = [
            published("8D4840D6202CC371C32CE0576098"),
            published("8D40621D58C382D690C8AC2863A7"),
            published("8D40621D58C386435CC412692AD6"),
            published("8C4841753A9A153237AEF0F275BE"),
            with(published("8D485020994409940838175B284F"), 10, 10, 0),
            with(published("8DA05F219B06B6AF189400CBC33F"), 14, 24, 0),
            published("8DA2C1B6E112B600000000760759"),
            with(published("8DA05629EA21485CBF3F8CADAEEB"), 44, 46, 0),
        ];
        assert_eq!(written, expected.map(Some));
    }

    #[test]
    fn identification_is_read_as_published() {
        // Arrange: "The 1090 Megahertz Riddle", aircraft identification
        let me = published("8D4840D6202CC371C32CE0576098");

        // Act
        let read = Identification::read(me);

        // Assert
        let expected = Identification {
            identification: Some("KLM1023".into()),
            emitter_category: EmitterCategory::Unspecified,
        };
        assert_eq!(read, Some(expected));
    }

    #[test]
    fn identification_is_read_as_it_is_written() {
        // Arrange: a category of each set, and no callsign
        let categories = [
            EmitterCategory::A3Large,
            EmitterCategory::B1Glider,
            EmitterCategory::C1SurfaceEmergencyVehicle,
            EmitterCategory::D7Reserved,
        ];
        let named = categories.map(|emitter_category| Identification {
            identification: Some("TEST01".into()),
            emitter_category,
        });
        let nameless = Identification {
            identification: None,
            emitter_category: EmitterCategory::A5Heavy,
        };
        let written: Vec<_> = named.into_iter().chain([nameless]).collect();

        // Act
        let read: Vec<_> = written.iter().map(reread).collect();

        // Assert
        assert_eq!(read, written.into_iter().map(Some).collect::<Vec<_>>());
    }

    #[test]
    fn identification_with_a_character_the_alphabet_does_not_assign_is_none() {
        // Arrange: the code 0 in place of the first character
        let sent = Identification {
            identification: Some("TEST01".into()),
            emitter_category: EmitterCategory::Unspecified,
        };
        let me = with(sent.write(), 9, 14, 0);

        // Act
        let read = Identification::read(me);

        // Assert
        assert_eq!(read.map(|read| read.identification), Some(None));
    }

    #[test]
    fn identification_padded_on_either_side_is_read_without_the_padding() {
        // Arrange: not left-justified as DO-260B has it, which some still send
        let sent = Identification {
            identification: Some("  TEST01".into()),
            emitter_category: EmitterCategory::Unspecified,
        };

        // Act
        let read = Identification::read(sent.write());

        // Assert
        let identification = read.and_then(|read| read.identification);
        assert_eq!(identification.as_deref(), Some("TEST01"));
    }

    #[test]
    fn airborne_positions_are_read_as_published() {
        // Arrange: "The 1090 Megahertz Riddle", airborne position, the even and the odd message
        let fields = [
            "8D40621D58C382D690C8AC2863A7",
            "8D40621D58C386435CC412692AD6",
        ]
        .map(published);

        // Act
        let read = fields.map(AirbornePosition::read);

        // Assert
        let position = |odd, lat, lon| {
            Some(AirbornePosition {
                cpr: Cpr { odd, lat, lon },
                baro_altitude_ft: Some(38_000),
                geometric_altitude_ft: None,
                type_code: 11,
                nic_supplement_b: false,
            })
        };
        let expected = [
            position(false, 93_000, 51_372),
            position(true, 74_158, 50_194),
        ];
        assert_eq!(read, expected);
    }

    #[test]
    fn airborne_position_is_read_as_it_is_written() {
        // Arrange: pressure altitudes from the lowest, a GNSS height, and no altitude
        let by_pressure = [-1000, -975, 0, 2500, 38_000, 50_175].map(|altitude| AirbornePosition {
            cpr: CPR,
            baro_altitude_ft: Some(altitude),
            geometric_altitude_ft: None,
            type_code: 11,
            nic_supplement_b: false,
        });
        let by_gnss = AirbornePosition {
            geometric_altitude_ft: Some(2500),
            baro_altitude_ft: None,
            type_code: 20,
            ..by_pressure[0]
        };
        let without = AirbornePosition {
            baro_altitude_ft: None,
            nic_supplement_b: true,
            ..by_pressure[0]
        };
        let written: Vec<_> = by_pressure.into_iter().chain([by_gnss, without]).collect();

        // Act
        let read: Vec<_> = written.iter().map(reread).collect();

        // Assert
        assert_eq!(read, written.into_iter().map(Some).collect::<Vec<_>>());
    }

    #[test]
    fn altitude_is_written_in_steps_of_25_ft_around_the_q_bit() {
        // Arrange
        let at = |altitude| AirbornePosition {
            cpr: CPR,
            baro_altitude_ft: Some(altitude),
            geometric_altitude_ft: None,
            type_code: 11,
            nic_supplement_b: false,
        };

        // Act
        let fields = [-1000, -975, 0, 2510].map(|altitude| at(altitude).write());

        // Assert: 0, 1, 40 and 140 steps, the Q bit fifth from the last
        let codes = fields.map(|me| me.get(9, 20));
        assert_eq!(codes, [0x010, 0x011, 0x058, 0x11c]);
    }

    #[test]
    fn altitude_in_gillham_code_runs_from_the_lowest_to_the_highest_of_mode_c() {
        // Arrange: the pulses as the 12 bits hold them, C1 A1 C2 A2 C4 A4 B1 Q B2 D2 B4 D4.
        // C1 C2 C4 step through 100 ft as 001 011 010 110 100, and back in every other 500 ft.
        const C4: u32 = 0x080;
        const C2: u32 = 0x200;
        const C1: u32 = 0x800;
        const B4: u32 = 0x002;
        const D2: u32 = 0x004;
        let codes = [C4, C2 | C4, C2, C1 | C2, C1, B4 | C1, B4 | C1 | C2, D2 | C4];
        let position = published("8D40621D58C382D690C8AC2863A7");

        // Act
        let read = codes.map(|code| AirbornePosition::read(with(position, 9, 20, code)));

        // Assert
        let altitudes = read.map(|read| read.and_then(|read| read.baro_altitude_ft));
        let expected = [-1200, -1100, -1000, -900, -800, -700, -600, 126_700];
        assert_eq!(altitudes, expected.map(Some));
    }

    #[test]
    fn altitude_code_that_gillham_does_not_assign_is_none() {
        // Arrange: no pulse among C1 C2 C4, and the three of them
        let position = published("8D40621D58C382D690C8AC2863A7");
        let codes = [0x002, 0xa80];

        // Act
        let read = codes.map(|code| AirbornePosition::read(with(position, 9, 20, code)));

        // Assert
        let altitudes = read.map(|read| read.map(|read| read.baro_altitude_ft));
        assert_eq!(altitudes, [Some(None), Some(None)]);
    }

    #[test]
    fn surface_position_is_read_as_published() {
        // Arrange: "The 1090 Megahertz Riddle", surface position
        let me = published("8C4841753A9A153237AEF0F275BE");

        // Act
        let read = SurfacePosition::read(me);

        // Assert
        let expected = SurfacePosition {
            cpr: Cpr {
                odd: true,
                lat: 39_195,
                lon: 110_320,
            },
            ground_speed_kt: Some(17.0),
            track_deg: Some(92.8125),
            type_code: 7,
        };
        assert_eq!(read, Some(expected));
    }

    #[test]
    fn surface_position_is_read_as_it_is_written() {
        // Arrange: a speed from each range of steps, and neither speed nor track
        let speeds = [0.0, 0.25, 1.5, 6.0, 18.0, 70.0, 120.0, 175.0];
        let moving = speeds.map(|speed| SurfacePosition {
            cpr: CPR,
            ground_speed_kt: Some(speed),
            track_deg: Some(340.3125),
            type_code: 7,
        });
        let unknown = SurfacePosition {
            ground_speed_kt: None,
            track_deg: None,
            ..moving[0]
        };
        let written: Vec<_> = moving.into_iter().chain([unknown]).collect();

        // Act
        let read: Vec<_> = written.iter().map(reread).collect();

        // Assert
        assert_eq!(read, written.into_iter().map(Some).collect::<Vec<_>>());
    }

    #[test]
    fn surface_speed_is_written_in_the_steps_of_its_range() {
        // Arrange
        let at = |speed| SurfacePosition {
            cpr: CPR,
            ground_speed_kt: Some(speed),
            track_deg: None,
            type_code: 7,
        };

        // Act
        let fields = [0.0, 0.3, 1.6, 6.0, 18.0, 71.0, 120.0, 180.0].map(|speed| at(speed).write());

        // Assert: stopped, then 0.25, 1.5, 6, 18, 70, 120 and 175 kt or more
        let codes = fields.map(|me| me.get(6, 12));
        assert_eq!(codes, [1, 3, 11, 21, 42, 94, 113, 124]);
    }

    #[test]
    fn velocity_over_the_ground_is_read_as_published() {
        // Arrange: "The 1090 Megahertz Riddle", airborne velocity, subtype 1
        let me = published("8D485020994409940838175B284F");

        // Act
        let read = Velocity::read(me);

        // Assert
        let read = read.expect("a velocity");
        let hundredths = |value: Option<f64>| value.map(|value| (value * 100.0).round() / 100.0);
        assert_eq!(hundredths(read.ground_speed_kt), Some(159.2));
        assert_eq!(hundredths(read.track_deg), Some(182.88));
        assert_eq!(read.airspeed, None);
        assert_eq!(read.baro_vertical_rate_fpm, None);
        assert_eq!(read.geometric_vertical_rate_fpm, Some(-832));
        assert_eq!(read.geometric_minus_baro_ft, Some(550));
    }

    #[test]
    fn airspeed_is_read_as_published() {
        // Arrange: "The 1090 Megahertz Riddle", airborne velocity, subtype 3
        let me = published("8DA05F219B06B6AF189400CBC33F");

        // Act
        let read = Velocity::read(me);

        // Assert
        let expected = Velocity {
            ground_speed_kt: None,
            track_deg: None,
            airspeed: Some(Airspeed::True(375.0)),
            baro_vertical_rate_fpm: Some(-2304),
            geometric_vertical_rate_fpm: None,
            geometric_minus_baro_ft: None,
        };
        assert_eq!(read, Some(expected));
    }

    #[test]
    fn velocity_is_read_as_it_is_written() {
        // Arrange: due north and due west, where the track is exact; both
        // kinds of airspeed, the second supersonic; and nothing known at all
        let unknown = Velocity {
            ground_speed_kt: None,
            track_deg: None,
            airspeed: None,
            baro_vertical_rate_fpm: None,
            geometric_vertical_rate_fpm: None,
            geometric_minus_baro_ft: None,
        };
        let written = [
            Velocity {
                ground_speed_kt: Some(290.0),
                track_deg: Some(0.0),
                baro_vertical_rate_fpm: Some(-1216),
                geometric_minus_baro_ft: Some(-25),
                ..unknown
            },
            Velocity {
                ground_speed_kt: Some(1200.0),
                track_deg: Some(270.0),
                geometric_vertical_rate_fpm: Some(1856),
                ..unknown
            },
            Velocity {
                airspeed: Some(Airspeed::Indicated(250.0)),
                ..unknown
            },
            Velocity {
                airspeed: Some(Airspeed::True(1200.0)),
                ..unknown
            },
            unknown,
        ];

        // Act
        let read = written.each_ref().map(reread);

        // Assert
        assert_eq!(read, written.map(Some));
    }

    #[test]
    fn velocity_is_written_along_its_track() {
        // Arrange
        let sent = Velocity {
            ground_speed_kt: Some(290.0),
            track_deg: Some(235.0),
            airspeed: None,
            baro_vertical_rate_fpm: Some(-1200),
            geometric_vertical_rate_fpm: None,
            geometric_minus_baro_ft: None,
        };

        // Act
        let read = reread(&sent);

        // Assert: to the knot of each component, and to the step of the rate
        let read = read.expect("a velocity");
        let (speed, track) = read
            .ground_speed_kt
            .zip(read.track_deg)
            .expect("over the ground");
        assert!((speed - 290.0).abs() < 1.0, "{speed} kt");
        assert!((track - 235.0).abs() < 0.2, "{track} degrees");
        assert_eq!(read.baro_vertical_rate_fpm, Some(-1216));
    }

    #[test]
    fn supersonic_velocity_is_of_its_own_subtype_in_steps_of_4_kt() {
        // Arrange
        let fast = |ground_speed_kt, airspeed| Velocity {
            ground_speed_kt,
            track_deg: ground_speed_kt.map(|_| 0.0),
            airspeed,
            baro_vertical_rate_fpm: None,
            geometric_vertical_rate_fpm: None,
            geometric_minus_baro_ft: None,
        };

        // Act
        let fields = [
            fast(Some(1200.0), None),
            fast(None, Some(Airspeed::True(1200.0))),
        ]
        .map(|velocity| velocity.write());

        // Assert: 300 steps, counted from 1, in the last ten bits of the speeds
        let subtypes = fields.map(|me| (me.get(6, 8), me.get(26, 35)));
        assert_eq!(subtypes, [(2, 301), (4, 301)]);
    }

    #[test]
    fn velocity_without_a_component_has_no_speed_or_track() {
        // Arrange: the east-west velocity is not available
        let me = with(published("8D485020994409940838175B284F"), 15, 24, 0);

        // Act
        let read = Velocity::read(me);

        // Assert
        let over_ground = read.map(|read| (read.ground_speed_kt, read.track_deg));
        assert_eq!(over_ground, Some((None, None)));
    }

    #[test]
    fn status_is_read_as_published() {
        // Arrange: from the tests of pyModeS, which reads its code as 6513
        let me = published("8DA2C1B6E112B600000000760759");

        // Act
        let read = Status::read(me);

        // Assert
        let expected = Status {
            emergency_priority_status: EmergencyPriorityStatus::NoEmergency,
            mode_a_code: Some(0o6513),
        };
        assert_eq!(read, Some(expected));
    }

    #[test]
    fn status_is_read_as_it_is_written() {
        // Arrange: every pulse of the code on its own and together, and no code
        let codes = [0o7700, 0o1200, 0o2431, 0o0001, 0o4000, 0o7777].map(Some);
        let written = codes.into_iter().chain([None]).map(|mode_a_code| Status {
            emergency_priority_status: EmergencyPriorityStatus::GeneralEmergency,
            mode_a_code,
        });
        let written: Vec<_> = written.collect();

        // Act
        let read: Vec<_> = written.iter().map(reread).collect();

        // Assert
        assert_eq!(read, written.into_iter().map(Some).collect::<Vec<_>>());
    }

    #[test]
    fn target_state_is_read_as_published() {
        // Arrange: from the tests of pyModeS
        let me = published("8DA05629EA21485CBF3F8CADAEEB");

        // Act
        let read = TargetStateAndStatus::read(me);

        // Assert
        let target = TargetState {
            selected_altitude_mcp_ft: Some(16_992),
            selected_altitude_fms_ft: None,
            selected_heading_deg: Some(66.796_875),
            baro_setting_hpa: Some(1012.8),
            modes: Some(Modes {
                autopilot: true,
                vnav: true,
                altitude_hold: false,
                approach: false,
                lnav: true,
                tcas: true,
            }),
        };
        assert_eq!(read, Some(TargetStateAndStatus { target, nac_p: 9 }));
    }

    #[test]
    fn target_state_is_read_as_it_is_written() {
        // Arrange: selected by the flight management system, with the modes that
        // the published one leaves out; and nothing selected at all
        let target = TargetState {
            selected_altitude_mcp_ft: None,
            selected_altitude_fms_ft: Some(20_992),
            selected_heading_deg: Some(270.0),
            baro_setting_hpa: Some(1013.6),
            modes: Some(Modes {
                altitude_hold: true,
                approach: true,
                ..Modes::default()
            }),
        };
        let written = [
            TargetStateAndStatus { target, nac_p: 10 },
            TargetStateAndStatus {
                target: TargetState::default(),
                nac_p: 0,
            },
        ];

        // Act
        let read = written.each_ref().map(reread);

        // Assert
        assert_eq!(read, written.map(Some));
    }

    #[test]
    fn operational_status_is_read_as_it_is_written() {
        // Arrange: in the air, on the ground with both supplements, of version 1
        // with one, and of version 0, which has neither them nor an accuracy
        let status = |on_ground, version, supplement_a, supplement_c, nac_p| OperationalStatus {
            on_ground,
            version,
            nic_supplement_a: supplement_a,
            nic_supplement_c: supplement_c,
            nac_p,
        };
        let written = [
            status(false, 2, false, false, Some(9)),
            status(true, 2, true, true, Some(10)),
            status(false, 1, true, false, Some(8)),
            status(false, 0, false, false, None),
        ];

        // Act
        let read = written.each_ref().map(reread);

        // Assert
        assert_eq!(read, written.map(Some));
    }

    #[test]
    fn operational_status_carries_the_version_before_the_supplement_and_the_accuracy() {
        // Arrange
        let status = OperationalStatus {
            on_ground: false,
            version: 2,
            nic_supplement_a: false,
            nic_supplement_c: false,
            nac_p: Some(9),
        };

        // Act
        let me = status.write();

        // Assert: type code 31 and subtype 0 first
        assert_eq!(me.bytes(), [0xf8, 0, 0, 0, 0, 0b0100_1001, 0]);
    }

    #[test]
    fn field_of_another_kind_or_layout_is_not_read() {
        // Arrange: a status of the subtype of a resolution advisory, a target
        // state as ADS-B version 1 lays it out, an operational status of a
        // subtype in reserve, and a velocity of a subtype in reserve
        let status = with(published("8DA2C1B6E112B600000000760759"), 6, 8, 2);
        let target = with(published("8DA05629EA21485CBF3F8CADAEEB"), 6, 7, 0);
        let operational = with(Bits::default().put(31, 5).filled(56), 6, 8, 2);
        let velocity = with(published("8D485020994409940838175B284F"), 6, 8, 5);

        // Act
        let read = (
            Status::read(status),
            TargetStateAndStatus::read(target),
            OperationalStatus::read(operational),
            Velocity::read(velocity),
            Identification::read(velocity),
        );

        // Assert
        assert_eq!(read, (None, None, None, None, None));
    }

    #[test]
    fn accuracy_of_version_0_is_tabled_for_every_position_type_code() {
        // Arrange: on the ground, in the air with a pressure altitude, and with a GNSS height
        let type_codes = (5..=18).chain(20..=22);

        // Act
        let categories: Vec<_> = type_codes.map(version_0_nac_p).collect();

        // Assert
        let surface = [11, 10, 8, 0];
        let airborne = [11, 10, 8, 7, 6, 5, 4, 1, 1, 0];
        let by_gnss = [11, 10, 0];
        let expected = surface.into_iter().chain(airborne).chain(by_gnss);
        assert_eq!(categories, expected.collect::<Vec<_>>());
    }

    #[test]
    fn integrity_category_is_that_of_the_type_code_and_the_supplements() {
        // Arrange: (type code, supplement A, supplement B in the air or C on the ground)
        let airborne = [
            (9, false, false),
            (10, false, false),
            (11, true, true),
            (11, false, false),
            (12, false, false),
            (13, false, false),
            (14, false, false),
            (15, false, false),
            (16, true, true),
            (16, false, false),
            (17, false, false),
            (18, false, false),
            (20, false, false),
            (21, false, false),
            (22, false, false),
        ];
        let surface = [
            (5, false, false),
            (6, false, false),
            (7, true, false),
            (7, false, false),
            (8, true, true),
            (8, true, false),
            (8, false, true),
            (8, false, false),
        ];

        // Act
        let categories = airborne
            .iter()
            .chain(&surface)
            .map(|&(type_code, a, other)| nic(type_code, a, other));

        // Assert
        let expected = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 11, 10, 0]
            .into_iter()
            .chain([11, 10, 9, 8, 7, 6, 6, 0]);
        assert_eq!(categories.collect::<Vec<_>>(), expected.collect::<Vec<_>>());
    }
}
