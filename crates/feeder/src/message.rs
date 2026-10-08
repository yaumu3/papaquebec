//! Mode S messages: what each says about an aircraft, and how an extended
//! squitter is put together.
//!
//! They are laid out as in ICAO Annex 10 Volume IV.

use crate::beast::Frame;
use crate::bits::Bits;
use crate::field::{
    AirbornePosition, Field, Identification, OperationalStatus, Status, SurfacePosition,
    TargetStateAndStatus, Velocity, altitude, mode_a_code,
};
use crate::proto::{Address, AddressType, Source};

/// What one message says, and about whom.
#[derive(Clone, Debug, PartialEq)]
pub struct Observation {
    pub address: Address,
    pub trust: Trust,
    /// How the message came, when not by the aircraft's own broadcast.
    pub source: Source,
    /// The power it was received at.
    pub rssi_dbfs: Option<f64>,
    pub report: Report,
}

/// How far the address of a message can be believed.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Trust {
    /// Sent in the clear under a bare parity, so the message vouches for it.
    Announced,
    /// Laid over the parity, or sent under an interrogator's code. Damage
    /// changes it into another address, so it is believed only of an aircraft
    /// already known.
    Recovered,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Report {
    Identification(Identification),
    AirbornePosition(AirbornePosition),
    SurfacePosition(SurfacePosition),
    Velocity(Velocity),
    Status(Status),
    TargetStateAndStatus(TargetStateAndStatus),
    OperationalStatus(OperationalStatus),
    Reply(Reply),
}

/// A reply to an interrogation, or an acquisition squitter: the aircraft is
/// there, and what it says of itself besides.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Reply {
    /// None when the reply leaves it open.
    pub on_ground: Option<bool>,
    /// In a surveillance or an air-to-air reply.
    pub baro_altitude_ft: Option<i32>,
    /// In a surveillance reply.
    pub mode_a_code: Option<u32>,
}

/// The downlink format of an extended squitter, with the capability of a
/// transponder in the air.
const SQUITTER: u32 = 17 << 3 | 5;

/// The extended squitter of a transponder at the ICAO address, with the message field.
#[must_use]
pub fn squitter(address: u32, me: Bits) -> [u8; 14] {
    let body = Bits::default().put(SQUITTER, 8).put(address, 24).then(me);
    body.put(parity(&body.bytes::<11>()), 24).bytes()
}

/// What the frame's message says; none when it is damaged or says nothing read here.
#[must_use]
pub fn read(frame: &Frame) -> Option<Observation> {
    let message = frame.message();
    let bits = Bits::of(message);
    // Formats from 16 on are the long ones.
    if (bits.get(1, 5) >= 16) != (bits.len() == 112) {
        return None;
    }
    let (address, trust, report) = heard(bits, overlay(message))?;
    Some(Observation {
        address,
        trust,
        source: if frame.multilaterated() {
            Source::Mlat
        } else {
            Source::Unspecified
        },
        rssi_dbfs: frame.rssi_dbfs(),
        report,
    })
}

/// Who sent the message and what it says, by its downlink format. `overlay`
/// is what lies over its parity.
fn heard(bits: Bits, overlay: u32) -> Option<(Address, Trust, Report)> {
    let address = |value, r#type: AddressType| Address {
        value,
        r#type: r#type.into(),
    };
    let recovered = (address(overlay, AddressType::Icao), Trust::Recovered);
    let announced = |r#type| (address(bits.get(9, 32), r#type), Trust::Announced);
    let ((address, trust), report) = match bits.get(1, 5) {
        // Air-to-air surveillance, whose vertical status only tells the ground apart.
        0 | 16 => (
            recovered,
            altitude_reply(bits, bits.flag(6).then_some(true)),
        ),
        4 | 20 => (recovered, altitude_reply(bits, flight_status(bits))),
        5 | 21 => (recovered, identity_reply(bits)),
        11 => (all_call(bits, overlay)?, all_call_reply(bits)),
        17 if overlay == 0 => (
            announced(AddressType::Icao),
            squittered(bits.field(33, 88))?,
        ),
        18 if overlay == 0 => (
            announced(non_transponder(bits)?),
            squittered(bits.field(33, 88))?,
        ),
        _ => return None,
    };
    Some((address, trust, report))
}

/// What the message field of an extended squitter reports: the one kind that reads it.
fn squittered(me: Bits) -> Option<Report> {
    const KINDS: [fn(Bits) -> Option<Report>; 7] = [
        |me| Identification::read(me).map(Report::Identification),
        |me| SurfacePosition::read(me).map(Report::SurfacePosition),
        |me| AirbornePosition::read(me).map(Report::AirbornePosition),
        |me| Velocity::read(me).map(Report::Velocity),
        |me| Status::read(me).map(Report::Status),
        |me| TargetStateAndStatus::read(me).map(Report::TargetStateAndStatus),
        |me| OperationalStatus::read(me).map(Report::OperationalStatus),
    ];
    KINDS.iter().find_map(|read| read(me))
}

/// The address an all-call reply announces, trusted by what lies over its
/// parity: nothing, or the code of the interrogator it answers.
fn all_call(bits: Bits, overlay: u32) -> Option<(Address, Trust)> {
    let trust = match overlay {
        0 => Trust::Announced,
        1..=0x7f => Trust::Recovered,
        _ => return None,
    };
    let address = Address {
        value: bits.get(9, 32),
        r#type: AddressType::Icao.into(),
    };
    Some((address, trust))
}

fn all_call_reply(bits: Bits) -> Report {
    Report::Reply(Reply {
        // The capability says so at levels 4 and 5 only.
        on_ground: match bits.get(6, 8) {
            4 => Some(true),
            5 => Some(false),
            _ => None,
        },
        ..Reply::default()
    })
}

/// The kind of address a device that is no transponder broadcasts under, by
/// the control field; none for what is rebroadcast from the ground, not read here.
fn non_transponder(bits: Bits) -> Option<AddressType> {
    match bits.get(6, 8) {
        0 => Some(AddressType::Icao),
        1 => Some(AddressType::NonIcao),
        _ => None,
    }
}

fn altitude_reply(bits: Bits, on_ground: Option<bool>) -> Report {
    Report::Reply(Reply {
        on_ground,
        baro_altitude_ft: altitude(bits.get(20, 32)),
        ..Reply::default()
    })
}

fn identity_reply(bits: Bits) -> Report {
    Report::Reply(Reply {
        on_ground: flight_status(bits),
        mode_a_code: Some(mode_a_code(bits.get(20, 32))),
        ..Reply::default()
    })
}

/// Whether the flight status of a surveillance reply puts the aircraft on the
/// ground; none for the two values that leave it open.
fn flight_status(bits: Bits) -> Option<bool> {
    match bits.get(6, 8) {
        0 | 2 => Some(false),
        1 | 3 => Some(true),
        _ => None,
    }
}

/// What the sender laid over the parity of the message: nothing when the
/// parity is bare and the message whole, or else an address or an interrogator.
fn overlay(message: &[u8]) -> u32 {
    let (body, sent) = message.split_at(message.len() - 3);
    parity(body) ^ Bits::of(sent).get(1, 24)
}

/// The parity of what a message carries before it: the remainder by the generator.
fn parity(body: &[u8]) -> u32 {
    /// The generator of the Mode S parity, from Annex 10 Volume IV.
    const GENERATOR: u32 = 0x01ff_f409;
    let mut remainder = 0;
    for &byte in body {
        remainder ^= u32::from(byte) << 16;
        for _ in 0..8 {
            remainder <<= 1;
            if remainder & 0x0100_0000 != 0 {
                remainder ^= GENERATOR;
            }
        }
    }
    remainder & 0x00ff_ffff
}

#[cfg(test)]
mod tests {
    use super::{Observation, Reply, Report, Trust, overlay, read, squitter};
    use crate::beast::Frame;
    use crate::field::{Field, Identification, OperationalStatus};
    use crate::proto::{Address, AddressType, EmitterCategory, Source};

    /// Made up: from a block ICAO reserves for future use.
    const ADDRESS: u32 = 0x00d0_0001;

    /// The power of signal level 128.
    const RSSI_DBFS: f64 = -5.986_604_215_721_735;

    fn frame(message: &[u8]) -> Frame {
        Frame::new(0, 128, message).expect("a message")
    }

    fn icao(value: u32) -> Address {
        Address {
            value,
            r#type: AddressType::Icao.into(),
        }
    }

    fn identification(callsign: &str) -> Identification {
        Identification {
            identification: Some(callsign.into()),
            emitter_category: EmitterCategory::Unspecified,
        }
    }

    /// The message with the address or the code laid over a parity that fits the rest.
    fn overlaid<const N: usize>(mut message: [u8; N], over: u32) -> [u8; N] {
        message[N - 3..].fill(0);
        let parity = overlay(&message) ^ over;
        message[N - 3..].copy_from_slice(&parity.to_be_bytes()[1..]);
        message
    }

    /// A surveillance reply of the format from the made-up address: the flight
    /// status, then 11 bits not read here, then the 13-bit altitude or identity code.
    fn reply(format: u8, flight_status: u8, code: u32) -> [u8; 7] {
        let head = u32::from(format) << 27 | u32::from(flight_status) << 24 | code;
        let mut message = [0; 7];
        message[..4].copy_from_slice(&head.to_be_bytes());
        overlaid(message, ADDRESS)
    }

    /// The altitude code of 25 ft steps for the altitude, its M bit clear and its Q bit set.
    fn altitude_code(altitude_ft: i32) -> u32 {
        let steps = u32::try_from((altitude_ft + 1000) / 25).expect("above -1000 ft");
        (steps & 0x7e0) << 2 | (steps & 0x10) << 1 | 0x10 | steps & 0xf
    }

    fn bytes(hex: &str) -> Vec<u8> {
        let digits = |at| u8::from_str_radix(&hex[at..at + 2], 16).expect("hexadecimal");
        (0..hex.len()).step_by(2).map(digits).collect()
    }

    /// What the published message says.
    fn published(hex: &str) -> Option<Observation> {
        read(&frame(&bytes(hex)))
    }

    #[test]
    fn squitter_is_put_together_as_published() {
        // Arrange
        let me = identification("KLM1023").write();

        // Act
        let message = squitter(0x0048_40d6, me);

        // Assert: "The 1090 Megahertz Riddle", aircraft identification
        assert_eq!(message[..], bytes("8D4840D6202CC371C32CE0576098"));
    }

    #[test]
    fn squitter_is_read_with_whom_it_is_from_and_how_it_was_heard() {
        // Arrange: "The 1090 Megahertz Riddle", aircraft identification
        let message = "8D4840D6202CC371C32CE0576098";

        // Act
        let observation = published(message);

        // Assert
        let expected = Observation {
            address: icao(0x0048_40d6),
            trust: Trust::Announced,
            source: Source::Unspecified,
            rssi_dbfs: Some(RSSI_DBFS),
            report: Report::Identification(identification("KLM1023")),
        };
        assert_eq!(observation, Some(expected));
    }

    #[test]
    fn squitter_is_read_by_the_kind_of_its_message_field() {
        // Arrange: published in "The 1090 Megahertz Riddle" and in the tests of pyModeS
        let status = OperationalStatus {
            on_ground: false,
            version: 2,
            nic_supplement_a: false,
            nic_supplement_c: false,
            nac_p: Some(9),
        };
        let messages = [
            bytes("8D4840D6202CC371C32CE0576098"),
            bytes("8D40621D58C382D690C8AC2863A7"),
            bytes("8C4841753A9A153237AEF0F275BE"),
            bytes("8D485020994409940838175B284F"),
            bytes("8DA2C1B6E112B600000000760759"),
            bytes("8DA05629EA21485CBF3F8CADAEEB"),
            squitter(ADDRESS, status.write()).to_vec(),
        ];

        // Act
        let reports = messages.map(|message| read(&frame(&message)).map(|heard| heard.report));

        // Assert
        let kinds = reports.map(|report| match report {
            Some(Report::Identification(_)) => "identification",
            Some(Report::AirbornePosition(_)) => "airborne position",
            Some(Report::SurfacePosition(_)) => "surface position",
            Some(Report::Velocity(_)) => "velocity",
            Some(Report::Status(_)) => "status",
            Some(Report::TargetStateAndStatus(_)) => "target state",
            Some(Report::OperationalStatus(read)) if read == status => "operational status",
            _ => "another",
        });
        let expected = [
            "identification",
            "airborne position",
            "surface position",
            "velocity",
            "status",
            "target state",
            "operational status",
        ];
        assert_eq!(kinds, expected);
    }

    #[test]
    fn surveillance_replies_are_read_as_published() {
        // Arrange: from the tests of pyModeS, which reads 32300 ft and the code 1346
        let messages = [
            "A02014B400000000000000F9D514",
            "A800292DFFBBA9383FFCEB903D01",
        ];

        // Act
        let reports = messages.map(|message| published(message).map(|heard| heard.report));

        // Assert
        let expected = [
            Reply {
                on_ground: Some(false),
                baro_altitude_ft: Some(32_300),
                ..Reply::default()
            },
            Reply {
                on_ground: Some(false),
                mode_a_code: Some(0o1346),
                ..Reply::default()
            },
        ];
        assert_eq!(reports, expected.map(|reply| Some(Report::Reply(reply))));
    }

    #[test]
    fn replies_of_every_format_carry_the_address_over_their_parity() {
        // Arrange: short and long, to the ground and to other aircraft
        let code = altitude_code(2500);
        let mut long_air_air = [0; 14];
        long_air_air[..7].copy_from_slice(&reply(16, 0, code));
        let mut comm_b = [0; 14];
        comm_b[..7].copy_from_slice(&reply(21, 0, 0x0808));
        let messages = [
            reply(0, 0, code).to_vec(),
            reply(4, 0, code).to_vec(),
            overlaid(long_air_air, ADDRESS).to_vec(),
            reply(5, 0, 0x0808).to_vec(),
            overlaid(comm_b, ADDRESS).to_vec(),
        ];

        // Act
        let observations = messages.map(|message| read(&frame(&message)));

        // Assert
        let altitude = |on_ground| {
            Report::Reply(Reply {
                on_ground,
                baro_altitude_ft: Some(2500),
                ..Reply::default()
            })
        };
        // A1 and B2 are the pulses set.
        let identity = Report::Reply(Reply {
            on_ground: Some(false),
            mode_a_code: Some(0o1200),
            ..Reply::default()
        });
        let expected = [
            altitude(None),
            altitude(Some(false)),
            altitude(None),
            identity.clone(),
            identity,
        ];
        let heard =
            observations.map(|heard| heard.map(|heard| (heard.address, heard.trust, heard.report)));
        let recovered = |report| Some((icao(ADDRESS), Trust::Recovered, report));
        assert_eq!(heard, expected.map(recovered));
    }

    #[test]
    fn flight_status_says_whether_the_aircraft_is_on_the_ground() {
        // Arrange: airborne, on the ground, either with an alert, and two that leave it open
        let statuses = [0, 1, 2, 3, 4, 5];

        // Act
        let reports = statuses.map(|status| {
            read(&frame(&reply(4, status, altitude_code(0)))).map(|heard| heard.report)
        });

        // Assert
        let expected = [Some(false), Some(true), Some(false), Some(true), None, None];
        let on_ground = reports.map(|report| match report {
            Some(Report::Reply(reply)) => reply.on_ground,
            other => panic!("not a reply: {other:?}"),
        });
        assert_eq!(on_ground, expected);
    }

    #[test]
    fn air_to_air_reply_says_only_when_the_aircraft_is_on_the_ground() {
        // Arrange: the vertical status is the bit after the format
        let messages = [
            reply(0, 0b100, altitude_code(0)),
            reply(0, 0, altitude_code(0)),
        ];

        // Act
        let reports = messages.map(|message| read(&frame(&message)).map(|heard| heard.report));

        // Assert
        let altitude = |on_ground| {
            Some(Report::Reply(Reply {
                on_ground,
                baro_altitude_ft: Some(0),
                ..Reply::default()
            }))
        };
        assert_eq!(reports, [altitude(Some(true)), altitude(None)]);
    }

    #[test]
    fn all_call_reply_is_trusted_by_what_lies_over_its_parity() {
        // Arrange: an acquisition squitter, a reply to interrogator 5, and damage
        let mut message = [0; 7];
        message[0] = 11 << 3 | 5;
        message[1..4].copy_from_slice(&ADDRESS.to_be_bytes()[1..]);
        let messages = [0, 5, 0x0001_0000].map(|over| overlaid(message, over));

        // Act
        let observations = messages.map(|message| read(&frame(&message)));

        // Assert
        let heard =
            observations.map(|heard| heard.map(|heard| (heard.address, heard.trust, heard.report)));
        let airborne = Report::Reply(Reply {
            on_ground: Some(false),
            ..Reply::default()
        });
        let expected = [
            Some((icao(ADDRESS), Trust::Announced, airborne.clone())),
            Some((icao(ADDRESS), Trust::Recovered, airborne)),
            None,
        ];
        assert_eq!(heard, expected);
    }

    #[test]
    fn squitter_of_a_device_that_is_no_transponder_is_read_by_its_kind_of_address() {
        // Arrange: DF18 with an ICAO address, another address, and a rebroadcast not read here
        let mut message = squitter(ADDRESS, identification("TEST01").write());
        let messages = [0, 1, 6].map(|control| {
            message[0] = 18 << 3 | control;
            overlaid(message, 0)
        });

        // Act
        let observations = messages.map(|message| read(&frame(&message)));

        // Assert
        let addresses = observations.map(|heard| heard.map(|heard| heard.address));
        let other = Address {
            value: ADDRESS,
            r#type: AddressType::NonIcao.into(),
        };
        assert_eq!(addresses, [Some(icao(ADDRESS)), Some(other), None]);
    }

    #[test]
    fn message_that_came_by_multilateration_says_so() {
        // Arrange: readsb stamps such a message so, and measures no signal
        let message = squitter(ADDRESS, identification("TEST01").write());
        let frame = Frame::new(Frame::MULTILATERATED, 0, &message).expect("a message");

        // Act
        let observation = read(&frame);

        // Assert
        let heard = observation.map(|heard| (heard.source, heard.rssi_dbfs));
        assert_eq!(heard, Some((Source::Mlat, None)));
    }

    #[test]
    fn long_format_in_a_short_frame_says_nothing() {
        // Arrange
        let message = squitter(ADDRESS, identification("TEST01").write());

        // Act
        let observation = read(&frame(&message[..7]));

        // Assert
        assert_eq!(observation, None);
    }

    #[test]
    fn damaged_message_says_nothing() {
        // Arrange
        let mut message = squitter(ADDRESS, identification("TEST01").write());
        message[5] ^= 0x01;

        // Act
        let observation = read(&frame(&message));

        // Assert
        assert_eq!(observation, None);
    }

    #[test]
    fn squitter_of_a_kind_not_read_says_nothing() {
        // Arrange: type code 0 carries no position
        let message = squitter(ADDRESS, crate::bits::Bits::of(&[0; 7]));

        // Act
        let observation = read(&frame(&message));

        // Assert
        assert_eq!(observation, None);
    }
}
