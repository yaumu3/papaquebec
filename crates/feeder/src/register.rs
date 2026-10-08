//! The Comm-B registers a transponder answers with, each read and written in
//! one place.
//!
//! They are laid out as in ICAO Doc 9871. A reply does not say which register
//! it carries: the field is read as the one register it fits, and where it
//! fits two, as the one that agrees with what is known of the aircraft, after
//! "The 1090 Megahertz Riddle" (BDS code inference).

use crate::air;
use crate::bits::Bits;
use crate::field::{Field, Identification, count, rounded};
use crate::proto::{EmitterCategory, TargetState, target_state::Modes};

/// The envelope within which a field is taken for a track and turn report or
/// a heading and speed one, after "The 1090 Megahertz Riddle" (BDS code
/// inference) and the tests of `pyModeS`: how far an airliner banks, how fast
/// it goes over the ground and through the air, how far the wind tells the
/// two apart, and how fast it climbs or descends.
const ROLL_MOST_DEG: f64 = 35.0;
const GROUND_SPEED_MOST_KT: f64 = 600.0;
const TRUE_AIRSPEED_MOST_KT: f64 = 500.0;
const WIND_MOST_KT: f64 = 200.0;
const INDICATED_AIRSPEED_MOST_KT: f64 = 500.0;
const MACH_MOST: f64 = 1.0;
const VERTICAL_RATE_MOST_FPM: i32 = 6000;

/// How far a report's values may lie from what is known of the aircraft and
/// still be read as its: enough to tell the two reports apart, which differ
/// wildly, not to judge the data.
const BEARING_TOLERANCE_DEG: f64 = 10.0;
const SPEED_TOLERANCE_KT: f64 = 30.0;
const MACH_TOLERANCE: f64 = 0.05;

/// What a Comm-B register says.
#[derive(Clone, Debug, PartialEq)]
pub enum Register {
    /// Aircraft identification, register 2,0: the callsign.
    Identification(String),
    SelectedVerticalIntention(SelectedVerticalIntention),
    TrackAndTurn(TrackAndTurn),
    HeadingAndSpeed(HeadingAndSpeed),
}

/// What is known of the aircraft from its other messages, which tells a
/// register of one layout from one of another.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Known {
    pub track_deg: Option<f64>,
    pub ground_speed_kt: Option<f64>,
    pub true_airspeed_kt: Option<f64>,
    pub baro_altitude_ft: Option<i32>,
    pub magnetic_heading_deg: Option<f64>,
    pub indicated_airspeed_kt: Option<f64>,
    pub mach: Option<f64>,
}

impl Register {
    /// What the message field of a Comm-B reply says: the one register it
    /// reads as, or of several, the one nearest to what is known.
    #[must_use]
    pub fn read(mb: Bits, known: &Known) -> Option<Self> {
        let candidates = [
            identification(mb).map(Self::Identification),
            SelectedVerticalIntention::read(mb).map(Self::SelectedVerticalIntention),
            TrackAndTurn::read(mb).map(Self::TrackAndTurn),
            HeadingAndSpeed::read(mb).map(Self::HeadingAndSpeed),
        ];
        // Those not contradicted, the nearest first and one not compared last.
        let mut agreeing: Vec<_> = candidates
            .into_iter()
            .flatten()
            .map(|register| (register.disagreement(known), register))
            .filter(|(disagreement, _)| disagreement.is_none_or(|far| far <= 1.0))
            .map(|(disagreement, register)| (disagreement.unwrap_or(f64::INFINITY), register))
            .collect();
        agreeing.sort_by(|a, b| a.0.total_cmp(&b.0));
        let nearest = agreeing.first()?.0;
        let alone = agreeing.get(1).is_none_or(|next| nearest < next.0);
        alone.then(|| agreeing.swap_remove(0).1)
    }

    #[must_use]
    pub fn write(&self) -> Bits {
        match self {
            Self::Identification(callsign) => Identification {
                identification: Some(callsign.clone()),
                emitter_category: EmitterCategory::Unspecified,
            }
            .write(),
            Self::SelectedVerticalIntention(said) => said.write(),
            Self::TrackAndTurn(said) => said.write(),
            Self::HeadingAndSpeed(said) => said.write(),
        }
    }

    /// How far the register lies from what is known, against the tolerance:
    /// the furthest of the values both have; none when they have none.
    fn disagreement(&self, known: &Known) -> Option<f64> {
        let compared = match self {
            Self::Identification(_) | Self::SelectedVerticalIntention(_) => vec![],
            Self::TrackAndTurn(said) => vec![
                apart(said.track_deg, known.track_deg),
                off(
                    said.ground_speed_kt,
                    known.ground_speed_kt,
                    SPEED_TOLERANCE_KT,
                ),
                off(
                    said.true_airspeed_kt,
                    known.true_airspeed_kt,
                    SPEED_TOLERANCE_KT,
                ),
            ],
            Self::HeadingAndSpeed(said) => {
                // What the Mach number reads as at the altitude.
                let calibrated = said
                    .mach
                    .zip(known.baro_altitude_ft)
                    .map(|(mach, altitude)| air::calibrated_airspeed_kt(mach, f64::from(altitude)));
                vec![
                    apart(said.magnetic_heading_deg, known.magnetic_heading_deg),
                    off(
                        said.indicated_airspeed_kt,
                        known.indicated_airspeed_kt,
                        SPEED_TOLERANCE_KT,
                    ),
                    off(said.mach, known.mach, MACH_TOLERANCE),
                    off(said.indicated_airspeed_kt, calibrated, SPEED_TOLERANCE_KT),
                ]
            }
        };
        compared.into_iter().flatten().reduce(f64::max)
    }
}

/// How far a value is off the known one against the tolerance, when both are known.
fn off(said: Option<f64>, known: Option<f64>, tolerance: f64) -> Option<f64> {
    Some((said? - known?).abs() / tolerance)
}

/// How far a bearing is from the known one, the short way round.
fn apart(said: Option<f64>, known: Option<f64>) -> Option<f64> {
    Some(signed_bearing(said? - known?).abs() / BEARING_TOLERANCE_DEG)
}

/// A bearing as the angle from north, -180 up to 180.
fn signed_bearing(bearing_deg: f64) -> f64 {
    (bearing_deg + 180.0).rem_euclid(360.0) - 180.0
}

/// The callsign of the aircraft identification register, which is laid out as
/// the identification message of an extended squitter with no category; none
/// without a callsign to read.
fn identification(mb: Bits) -> Option<String> {
    Identification::read(coded(mb, 0x20)?)?.identification
}

/// The field of the register with the code, which its first byte names.
fn coded(mb: Bits, code: u32) -> Option<Bits> {
    (mb.get(1, 8) == code).then_some(mb)
}

/// A field behind the status bit that gates it: the bit, then the first and
/// the last of the field.
type Gated = (u32, u32, u32);

/// The field behind its status bit, when the status says it is available.
fn available(mb: Bits, (status, first, last): Gated) -> Option<Bits> {
    mb.flag(status).then(|| mb.field(first, last))
}

/// Whether every field whose status says it is not available is all zeros,
/// as it is in the layout; set bits under such a status are of another.
fn consistent(mb: Bits, fields: &[Gated]) -> bool {
    fields
        .iter()
        .all(|&(status, first, last)| mb.flag(status) || mb.get(first, last) == 0)
}

/// A bearing counted in steps of 90/512° either way from north.
fn bearing(steps: i32) -> f64 {
    (f64::from(steps) * 90.0 / 512.0).rem_euclid(360.0)
}

/// A status bit and the field of `width` bits it says is available: the
/// count, rounded, or zeros.
fn counted(count_of: Option<f64>, width: u32) -> Bits {
    Bits::default()
        .put_flag(count_of.is_some())
        .put(count_of.map_or(0, count), width)
}

/// The same of a count that may be negative, in two's complement.
fn signed(count_of: Option<f64>, width: u32) -> Bits {
    Bits::default()
        .put_flag(count_of.is_some())
        .put_signed(count_of.map_or(0, rounded), width)
}

/// Selected vertical intention, register 4,0: what the aircraft is set to fly
/// to, as the Target State and Status message carries it but for the heading.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SelectedVerticalIntention {
    pub target: TargetState,
}

/// The fields of the selected vertical intention: the altitudes selected on
/// the panel and by the flight management system, the barometric setting,
/// the modes, and the source of the target altitude.
const SELECTED_VERTICAL_INTENTION: [Gated; 5] = [
    (1, 2, 13),
    (14, 15, 26),
    (27, 28, 39),
    (48, 49, 51),
    (54, 55, 56),
];

impl Field for SelectedVerticalIntention {
    fn read(mb: Bits) -> Option<Self> {
        let reserved = mb.get(40, 47) != 0 || mb.get(52, 53) != 0;
        if reserved || !consistent(mb, &SELECTED_VERTICAL_INTENTION) {
            return None;
        }
        // The source of the target altitude is not read.
        let [mcp, fms, baro, modes, _] =
            SELECTED_VERTICAL_INTENTION.map(|field| available(mb, field));
        let altitude =
            |bits: Option<Bits>| bits.and_then(|bits| i32::try_from(bits.get(1, 12) * 16).ok());
        let target = TargetState {
            selected_altitude_mcp_ft: altitude(mcp),
            selected_altitude_fms_ft: altitude(fms),
            selected_heading_deg: None,
            // In steps of 0.1 hPa from 800 hPa.
            baro_setting_hpa: baro.map(|bits| f64::from(8000 + bits.get(1, 12)) / 10.0),
            modes: modes.map(|bits| Modes {
                vnav: bits.flag(1),
                altitude_hold: bits.flag(2),
                approach: bits.flag(3),
                ..Modes::default()
            }),
        };
        (target != TargetState::default()).then_some(Self { target })
    }

    fn write(&self) -> Bits {
        let target = &self.target;
        let altitude = |ft: Option<i32>| counted(ft.map(|ft| f64::from(ft) / 16.0), 12);
        let modes = target.modes.unwrap_or_default();
        Bits::default()
            .then(altitude(target.selected_altitude_mcp_ft))
            .then(altitude(target.selected_altitude_fms_ft))
            .then(counted(
                target.baro_setting_hpa.map(|hpa| (hpa - 800.0) * 10.0),
                12,
            ))
            .put(0, 8)
            .put_flag(target.modes.is_some())
            .put_flag(modes.vnav)
            .put_flag(modes.altitude_hold)
            .put_flag(modes.approach)
            // Reserved, then the source of the target altitude
            .put(0, 2 + 3)
    }
}

/// Track and turn report, register 5,0.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct TrackAndTurn {
    /// Positive to the right.
    pub roll_deg: Option<f64>,
    /// True track over the ground.
    pub track_deg: Option<f64>,
    pub ground_speed_kt: Option<f64>,
    /// Positive to the right.
    pub track_rate_deg_per_s: Option<f64>,
    pub true_airspeed_kt: Option<f64>,
}

/// The fields of the track and turn report: the roll, the track, the ground
/// speed, the track rate and the airspeed.
const TRACK_AND_TURN: [Gated; 5] = [
    (1, 2, 11),
    (12, 13, 23),
    (24, 25, 34),
    (35, 36, 45),
    (46, 47, 56),
];

impl Field for TrackAndTurn {
    fn read(mb: Bits) -> Option<Self> {
        if !consistent(mb, &TRACK_AND_TURN) {
            return None;
        }
        let [roll, track, speed, rate, airspeed] = TRACK_AND_TURN.map(|field| available(mb, field));
        let said = Self {
            roll_deg: roll.map(|bits| f64::from(bits.signed(1, 10)) * 45.0 / 256.0),
            track_deg: track.map(|bits| bearing(bits.signed(1, 11))),
            ground_speed_kt: speed.map(|bits| f64::from(bits.get(1, 10) * 2)),
            track_rate_deg_per_s: rate.map(|bits| f64::from(bits.signed(1, 10)) * 8.0 / 256.0),
            true_airspeed_kt: airspeed.map(|bits| f64::from(bits.get(1, 10) * 2)),
        };
        let within = said.roll_deg.is_none_or(|roll| roll.abs() <= ROLL_MOST_DEG)
            && said
                .ground_speed_kt
                .is_none_or(|speed| speed <= GROUND_SPEED_MOST_KT)
            && said
                .true_airspeed_kt
                .is_none_or(|speed| speed <= TRUE_AIRSPEED_MOST_KT)
            && said
                .ground_speed_kt
                .zip(said.true_airspeed_kt)
                .is_none_or(|(over, through)| (over - through).abs() <= WIND_MOST_KT);
        (within && said != Self::default()).then_some(said)
    }

    fn write(&self) -> Bits {
        Bits::default()
            .then(signed(self.roll_deg.map(|roll| roll * 256.0 / 45.0), 10))
            .then(signed(
                self.track_deg
                    .map(|track| signed_bearing(track) * 512.0 / 90.0),
                11,
            ))
            .then(counted(self.ground_speed_kt.map(|speed| speed / 2.0), 10))
            .then(signed(
                self.track_rate_deg_per_s.map(|rate| rate * 256.0 / 8.0),
                10,
            ))
            .then(counted(self.true_airspeed_kt.map(|speed| speed / 2.0), 10))
    }
}

/// Heading and speed report, register 6,0.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct HeadingAndSpeed {
    pub magnetic_heading_deg: Option<f64>,
    pub indicated_airspeed_kt: Option<f64>,
    pub mach: Option<f64>,
    pub baro_vertical_rate_fpm: Option<i32>,
    pub inertial_vertical_rate_fpm: Option<i32>,
}

/// The fields of the heading and speed report: the heading, the indicated
/// airspeed, the Mach number, and the vertical rates by pressure and by inertia.
const HEADING_AND_SPEED: [Gated; 5] = [
    (1, 2, 12),
    (13, 14, 23),
    (24, 25, 34),
    (35, 36, 45),
    (46, 47, 56),
];

impl Field for HeadingAndSpeed {
    fn read(mb: Bits) -> Option<Self> {
        if !consistent(mb, &HEADING_AND_SPEED) {
            return None;
        }
        let [heading, airspeed, mach, baro, inertial] =
            HEADING_AND_SPEED.map(|field| available(mb, field));
        let rate = |bits: Bits| bits.signed(1, 10) * 32;
        let said = Self {
            magnetic_heading_deg: heading.map(|bits| bearing(bits.signed(1, 11))),
            indicated_airspeed_kt: airspeed.map(|bits| f64::from(bits.get(1, 10))),
            mach: mach.map(|bits| f64::from(bits.get(1, 10)) / 250.0),
            baro_vertical_rate_fpm: baro.map(rate),
            inertial_vertical_rate_fpm: inertial.map(rate),
        };
        let within = said
            .indicated_airspeed_kt
            .is_none_or(|speed| speed <= INDICATED_AIRSPEED_MOST_KT)
            && said.mach.is_none_or(|mach| mach <= MACH_MOST)
            && said
                .baro_vertical_rate_fpm
                .is_none_or(|rate| rate.abs() <= VERTICAL_RATE_MOST_FPM)
            && said
                .inertial_vertical_rate_fpm
                .is_none_or(|rate| rate.abs() <= VERTICAL_RATE_MOST_FPM);
        (within && said != Self::default()).then_some(said)
    }

    fn write(&self) -> Bits {
        let rate = |fpm: Option<i32>| signed(fpm.map(|fpm| f64::from(fpm) / 32.0), 10);
        Bits::default()
            .then(signed(
                self.magnetic_heading_deg
                    .map(|heading| signed_bearing(heading) * 512.0 / 90.0),
                11,
            ))
            .then(counted(self.indicated_airspeed_kt, 10))
            .then(counted(self.mach.map(|mach| mach * 250.0), 10))
            .then(rate(self.baro_vertical_rate_fpm))
            .then(rate(self.inertial_vertical_rate_fpm))
    }
}

#[cfg(test)]
mod tests {
    use super::{HeadingAndSpeed, Known, Register, SelectedVerticalIntention, TrackAndTurn};
    use crate::bits::Bits;
    use crate::bits::published::{field as published, with};
    use crate::proto::{TargetState, target_state::Modes};

    /// What the message field of a published Comm-B reply reads as, with
    /// nothing known of the aircraft.
    fn read(hex: &str) -> Option<Register> {
        Register::read(published(hex), &Known::default())
    }

    fn kind(register: &Register) -> &'static str {
        match register {
            Register::Identification(_) => "identification",
            Register::SelectedVerticalIntention(_) => "selected vertical intention",
            Register::TrackAndTurn(_) => "track and turn",
            Register::HeadingAndSpeed(_) => "heading and speed",
        }
    }

    #[test]
    fn identification_is_read_as_published() {
        // Arrange: from the tests of pyModeS, the second padded on the right
        let messages = [
            "A000083E202CC371C31DE0AA1CCF",
            "A0001838201584F23468207CDFA5",
        ];

        // Act
        let read = messages.map(read);

        // Assert
        let expected =
            ["KLM1017", "EXS2MF"].map(|callsign| Some(Register::Identification(callsign.into())));
        assert_eq!(read, expected);
    }

    #[test]
    fn selected_vertical_intention_is_read_as_published() {
        // Arrange: "The 1090 Megahertz Riddle", which reads 24 000 ft and
        // 1013.2 hPa with no mode engaged; and the tests of pyModeS, which read
        // 3008 ft and 1020 hPa
        let messages = [
            "A8001EBCAEE57730A80106DE1344",
            "A000029C85E42F313000007047D3",
        ];

        // Act
        let read = messages.map(read);

        // Assert
        let selected = |ft, hpa, modes| {
            Some(Register::SelectedVerticalIntention(
                SelectedVerticalIntention {
                    target: TargetState {
                        selected_altitude_mcp_ft: Some(ft),
                        selected_altitude_fms_ft: Some(ft),
                        selected_heading_deg: None,
                        baro_setting_hpa: Some(hpa),
                        modes,
                    },
                },
            ))
        };
        let expected = [
            selected(24_000, 1013.2, Some(Modes::default())),
            selected(3008, 1020.0, None),
        ];
        assert_eq!(read, expected);
    }

    #[test]
    fn track_and_turn_is_read_as_published() {
        // Arrange: "The 1090 Megahertz Riddle", then the tests of pyModeS
        let messages = [
            "A80006ACF9363D3BBF9CE98F1E1D",
            "A000139381951536E024D4CCF6B5",
        ];

        // Act
        let read = messages.map(read);

        // Assert: to the bit, which the published values are rounded from
        let report =
            |roll_deg, track_deg, ground_speed_kt, track_rate_deg_per_s, true_airspeed_kt| {
                Some(Register::TrackAndTurn(TrackAndTurn {
                    roll_deg: Some(roll_deg),
                    track_deg: Some(track_deg),
                    ground_speed_kt: Some(ground_speed_kt),
                    track_rate_deg_per_s: Some(track_rate_deg_per_s),
                    true_airspeed_kt: Some(true_airspeed_kt),
                }))
            };
        let expected = [
            report(-9.667_968_75, 140.273_437_5, 476.0, -0.406_25, 466.0),
            report(2.109_375, 114.257_812_5, 438.0, 0.125, 424.0),
        ];
        assert_eq!(read, expected);
    }

    #[test]
    fn heading_and_speed_is_read_as_published() {
        // Arrange: "The 1090 Megahertz Riddle", then the tests of pyModeS
        let messages = [
            "A80004AAA74A072BFDEFC1D5CB4F",
            "A00004128F39F91A7E27C46ADC21",
        ];

        // Act
        let read = messages.map(read);

        // Assert: to the bit, which the published values are rounded from
        let report = |magnetic_heading_deg, indicated_airspeed_kt, mach, baro, inertial| {
            Some(Register::HeadingAndSpeed(HeadingAndSpeed {
                magnetic_heading_deg: Some(magnetic_heading_deg),
                indicated_airspeed_kt: Some(indicated_airspeed_kt),
                mach: Some(mach),
                baro_vertical_rate_fpm: Some(baro),
                inertial_vertical_rate_fpm: Some(inertial),
            }))
        };
        let expected = [
            report(110.390_625, 259.0, 0.7, -2144, -2016),
            report(42.714_843_75, 252.0, 0.42, -1920, -1920),
        ];
        assert_eq!(read, expected);
    }

    #[test]
    fn published_registers_are_written_back_as_they_were_read() {
        // Arrange: one of each kind
        let messages = [
            "A000083E202CC371C31DE0AA1CCF",
            "A8001EBCAEE57730A80106DE1344",
            "A80006ACF9363D3BBF9CE98F1E1D",
            "A80004AAA74A072BFDEFC1D5CB4F",
        ];

        // Act
        let written = messages.map(|hex| read(hex).map(|register| register.write()));

        // Assert: but for the source of the target altitude, which is not read
        // and so written as zeros
        let expected = [
            published(messages[0]),
            with(published(messages[1]), 54, 56, 0),
            published(messages[2]),
            published(messages[3]),
        ];
        assert_eq!(written, expected.map(Some));
    }

    #[test]
    fn registers_are_read_as_they_are_written() {
        // Arrange: values on the steps of their fields, just short of north and
        // below zero, and fields not available
        let intention =
            |target| Register::SelectedVerticalIntention(SelectedVerticalIntention { target });
        let written = vec![
            Register::Identification("TEST01".into()),
            intention(TargetState {
                selected_altitude_mcp_ft: Some(20_992),
                selected_altitude_fms_ft: None,
                selected_heading_deg: None,
                baro_setting_hpa: Some(1013.6),
                modes: Some(Modes {
                    vnav: true,
                    approach: true,
                    ..Modes::default()
                }),
            }),
            intention(TargetState {
                selected_altitude_fms_ft: Some(0),
                ..TargetState::default()
            }),
            Register::TrackAndTurn(TrackAndTurn {
                roll_deg: Some(-30.234_375),
                track_deg: Some(359.824_218_75),
                ground_speed_kt: Some(480.0),
                track_rate_deg_per_s: Some(-0.5),
                true_airspeed_kt: Some(450.0),
            }),
            Register::TrackAndTurn(TrackAndTurn {
                track_deg: Some(180.0),
                true_airspeed_kt: Some(300.0),
                ..TrackAndTurn::default()
            }),
            Register::HeadingAndSpeed(HeadingAndSpeed {
                magnetic_heading_deg: Some(270.0),
                indicated_airspeed_kt: Some(250.0),
                mach: Some(0.78),
                baro_vertical_rate_fpm: Some(-1216),
                inertial_vertical_rate_fpm: Some(1856),
            }),
            Register::HeadingAndSpeed(HeadingAndSpeed {
                indicated_airspeed_kt: Some(250.0),
                baro_vertical_rate_fpm: Some(-1216),
                ..HeadingAndSpeed::default()
            }),
        ];

        // Act
        let read: Vec<_> = written
            .iter()
            .map(|register| Register::read(register.write(), &Known::default()))
            .collect();

        // Assert
        assert_eq!(read, written.into_iter().map(Some).collect::<Vec<_>>());
    }

    #[test]
    fn field_of_two_layouts_is_read_by_what_is_known() {
        // Arrange: from the tests of pyModeS, a field that reads as a track and
        // turn report on 239° at 240 kt and as a heading and speed one on 359°
        let both = Bits::of(&[0xff, 0xba, 0xa1, 0x1e, 0x20, 0x04, 0x72]);
        let nothing = Known::default();
        let moving = Known {
            ground_speed_kt: Some(240.0),
            ..nothing
        };
        let heading = Known {
            magnetic_heading_deg: Some(359.0),
            ..nothing
        };
        let turned = Known {
            track_deg: Some(245.0),
            magnetic_heading_deg: Some(1.0),
            ..nothing
        };

        // Act
        let read = [nothing, moving, heading, turned].map(|known| Register::read(both, &known));

        // Assert
        let kinds = read.map(|register| register.as_ref().map(kind));
        let expected = [
            None,
            Some("track and turn"),
            Some("heading and speed"),
            Some("heading and speed"),
        ];
        assert_eq!(kinds, expected);
    }

    #[test]
    fn heading_and_speed_is_told_by_its_mach_number_and_airspeed_at_the_altitude() {
        // Arrange: "The 1090 Megahertz Riddle", BDS code inference, a field of
        // both layouts that pyModeS tells apart by 320 kt on 250° at 14 000 ft
        let both = published("A8001EBCFFFB23286004A73F6A5B");
        let nothing = Known::default();
        let at_altitude = Known {
            baro_altitude_ft: Some(14_000),
            ..nothing
        };
        let on_track = Known {
            track_deg: Some(250.0),
            ground_speed_kt: Some(320.0),
            ..at_altitude
        };

        // Act
        let read = [nothing, at_altitude, on_track].map(|known| Register::read(both, &known));

        // Assert: Mach 0.644 reads as 333 kt there, not the 401 kt of that layout
        let kinds = read.map(|register| register.as_ref().map(kind));
        assert_eq!(
            kinds,
            [None, Some("track and turn"), Some("track and turn")]
        );
    }

    #[test]
    fn report_that_contradicts_what_is_known_is_not_read() {
        // Arrange: a track and turn report on 114°, of an aircraft known to be on 300°
        let report = published("A000139381951536E024D4CCF6B5");
        let known = Known {
            track_deg: Some(300.0),
            ..Known::default()
        };

        // Act
        let read = Register::read(report, &known);

        // Assert
        assert_eq!(read, None);
    }

    #[test]
    fn track_and_turn_outside_its_envelope_is_not_read() {
        // Arrange: "The 1090 Megahertz Riddle", BDS code inference, a field
        // whose airspeed as a track and turn report is 2 kt; then a report
        // banked 36°, one at 602 kt over the ground, one at 502 kt through the
        // air, and one 202 kt apart between the two
        let report = published("A000139381951536E024D4CCF6B5");
        let fields = [
            published("A0001838E519F33160240142D7FA"),
            with(report, 2, 11, 205),
            with(report, 25, 34, 301),
            with(report, 47, 56, 251),
            with(with(report, 25, 34, 75), 47, 56, 176),
        ];

        // Act
        let read = fields.map(|mb| Register::read(mb, &Known::default()));

        // Assert
        let kinds = read.map(|register| register.as_ref().map(kind));
        assert_eq!(kinds, [Some("heading and speed"), None, None, None, None]);
    }

    #[test]
    fn heading_and_speed_outside_its_envelope_is_not_read() {
        // Arrange: the published report at 501 kt, at Mach 1.004, and climbing 6016 fpm
        let report = published("A00004128F39F91A7E27C46ADC21");
        let fields = [
            with(report, 14, 23, 501),
            with(report, 25, 34, 251),
            with(report, 36, 45, 188),
        ];

        // Act
        let read = fields.map(|mb| Register::read(mb, &Known::default()));

        // Assert
        assert_eq!(read, [None, None, None]);
    }

    #[test]
    fn field_set_under_a_status_that_says_it_is_not_is_of_another_layout() {
        // Arrange: the reports with the status of their first field cleared
        let fields = [
            with(published("A000139381951536E024D4CCF6B5"), 1, 1, 0),
            with(published("A00004128F39F91A7E27C46ADC21"), 1, 1, 0),
            with(published("A8001EBCAEE57730A80106DE1344"), 1, 1, 0),
        ];

        // Act
        let read = fields.map(|mb| Register::read(mb, &Known::default()));

        // Assert
        assert_eq!(read, [None, None, None]);
    }

    #[test]
    fn empty_field_says_nothing() {
        // Arrange
        let empty = Bits::of(&[0; 7]);

        // Act
        let read = Register::read(empty, &Known::default());

        // Assert
        assert_eq!(read, None);
    }
}
