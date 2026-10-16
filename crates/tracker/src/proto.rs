//! The feed's wire contract, generated from `proto/papaquebec/feed/v2/feed.proto`.
//!
//! The tracker keeps what it hears in these types, so the feeder sends them as they are.

#[allow(clippy::pedantic)]
mod generated {
    include!(concat!(env!("OUT_DIR"), "/papaquebec.feed.v2.rs"));
}

pub use generated::*;

/// An instant as the feed carries it: the seconds since the epoch as whole
/// milliseconds, to the nearest; nothing before the epoch.
#[must_use]
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
pub fn ms(seconds: f64) -> u64 {
    (seconds * 1000.0).round().max(0.0) as u64
}

impl Address {
    #[must_use]
    pub fn new(value: u32, r#type: AddressType) -> Self {
        Self {
            value,
            r#type: r#type.into(),
        }
    }
}

impl From<Snapshot> for Frame {
    fn from(snapshot: Snapshot) -> Self {
        Self {
            body: Some(frame::Body::Snapshot(snapshot)),
        }
    }
}

impl From<Hello> for Frame {
    fn from(hello: Hello) -> Self {
        Self {
            body: Some(frame::Body::Hello(hello)),
        }
    }
}

impl From<Weather> for Frame {
    fn from(weather: Weather) -> Self {
        Self {
            body: Some(frame::Body::Weather(weather)),
        }
    }
}

#[cfg(test)]
mod tests {
    use prost::Message;

    use super::{
        Address, AddressType, Advisory, Aircraft, Emergency, EmergencyPriorityStatus,
        EmitterCategory, Flag, Frame, Identification, Int, Modes, Position, Real, Reception,
        Registry, Snapshot, Source,
        advisory::{Resolution, Threat, ThreatPosition},
        frame::Body,
        ms,
    };

    const NOW_MS: u64 = 1_700_000_000_500;
    /// A second before the snapshot.
    const HEARD_MS: u64 = NOW_MS - 1000;

    fn int(value: i32) -> Int {
        Int {
            value,
            heard_ms: HEARD_MS,
        }
    }

    fn real(value: f64) -> Real {
        Real {
            value,
            heard_ms: HEARD_MS,
        }
    }

    fn flag(value: bool) -> Flag {
        Flag {
            value,
            heard_ms: HEARD_MS,
        }
    }

    fn emergency(status: EmergencyPriorityStatus) -> Emergency {
        Emergency {
            status: status.into(),
            heard_ms: HEARD_MS,
        }
    }

    fn frame_of(aircraft: Aircraft) -> Frame {
        Frame {
            body: Some(Body::Snapshot(Snapshot {
                now_ms: NOW_MS,
                messages: 42,
                aircraft: vec![aircraft],
            })),
        }
    }

    #[test]
    fn frame_survives_the_wire() {
        // Arrange
        let frame = frame_of(Aircraft {
            address: Some(Address::new(0x00d0_0001, AddressType::Icao)),
            identification: Some(Identification {
                callsign: Some("TEST01".into()),
                emitter_category: None,
                heard_ms: HEARD_MS,
            }),
            baro_altitude_ft: Some(int(0)),
            emergency: Some(emergency(EmergencyPriorityStatus::NoEmergency)),
            ..Aircraft::default()
        });

        // Act
        let decoded = Frame::decode(frame.encode_to_vec().as_slice());

        // Assert
        assert_eq!(decoded, Ok(frame));
    }

    #[test]
    fn zero_is_kept_apart_from_unknown() {
        // Arrange
        let reported = frame_of(Aircraft {
            baro_altitude_ft: Some(int(0)),
            emergency: Some(emergency(EmergencyPriorityStatus::NoEmergency)),
            ..Aircraft::default()
        });
        let unknown = frame_of(Aircraft::default());

        // Act
        let encoded = [reported.encode_to_vec(), unknown.encode_to_vec()];

        // Assert
        assert_ne!(encoded[0], encoded[1]);
    }

    #[test]
    fn emergency_codes_match_the_status_subfield() {
        // Arrange
        let expected = [
            (EmergencyPriorityStatus::NoEmergency, 0),
            (EmergencyPriorityStatus::GeneralEmergency, 1),
            (EmergencyPriorityStatus::LifeguardMedical, 2),
            (EmergencyPriorityStatus::MinimumFuel, 3),
            (EmergencyPriorityStatus::NoCommunications, 4),
            (EmergencyPriorityStatus::UnlawfulInterference, 5),
            (EmergencyPriorityStatus::DownedAircraft, 6),
            (EmergencyPriorityStatus::Reserved, 7),
        ];

        // Act
        let actual = expected.map(|(status, _)| i32::from(status));

        // Assert
        assert_eq!(actual, expected.map(|(_, code)| code));
    }

    #[test]
    fn instants_are_the_nearest_whole_milliseconds_since_the_epoch() {
        // Arrange: half a millisecond up, down, and before the epoch
        let seconds = [1_700_000_000.5, 1_700_000_000.000_4, 0.000_5, -1.0];

        // Act
        let instants = seconds.map(ms);

        // Assert
        assert_eq!(instants, [1_700_000_000_500, 1_700_000_000_000, 1, 0]);
    }

    /// An aircraft of which the feed carries everything it can in the air.
    fn known_in_full() -> Aircraft {
        Aircraft {
            address: Some(Address::new(0x00d0_0001, AddressType::Icao)),
            reception: Some(Reception {
                messages: 1234,
                rssi_dbfs: Some(-12.5),
                heard_ms: HEARD_MS,
            }),
            identification: Some(Identification {
                callsign: Some("TEST01".into()),
                emitter_category: Some(EmitterCategory::A3Large.into()),
                heard_ms: HEARD_MS,
            }),
            position: Some(Position {
                lat_deg: 33.5,
                lon_deg: 130.5,
                source: Source::Unspecified.into(),
                nic: 8,
                rc_m: Some(186),
                heard_ms: HEARD_MS,
            }),
            modes: Some(Modes {
                autopilot: true,
                vnav: true,
                altitude_hold: true,
                approach: true,
                lnav: true,
                tcas: true,
                heard_ms: HEARD_MS,
            }),
            advisory: Some(Advisory {
                multiple_threats: false,
                resolution: Some(Resolution {
                    corrective: true,
                    positive: true,
                    ..Resolution::default()
                }),
                corrections: None,
                terminated: false,
                threat: Some(Threat::ThreatPosition(ThreatPosition {
                    altitude_ft: Some(35_000),
                    range_nm: Some(4.5),
                    bearing_deg: Some(117.0),
                })),
                heard_ms: HEARD_MS,
            }),
            mode_a_code: Some(int(0o0421)),
            emergency: Some(emergency(EmergencyPriorityStatus::NoEmergency)),
            ident: Some(flag(true)),
            on_ground: Some(flag(false)),
            baro_altitude_ft: Some(int(35_000)),
            geometric_altitude_ft: Some(int(35_625)),
            ground_speed_kt: Some(real(451.2)),
            track_deg: Some(real(182.9)),
            baro_vertical_rate_fpm: Some(int(-832)),
            geometric_vertical_rate_fpm: Some(int(-768)),
            indicated_airspeed_kt: Some(real(280.0)),
            true_airspeed_kt: Some(real(440.0)),
            mach: Some(real(0.78)),
            magnetic_heading_deg: Some(real(176.1)),
            roll_deg: Some(real(-9.5)),
            track_rate_deg_per_s: Some(real(-0.4)),
            selected_altitude_mcp_ft: Some(int(6000)),
            selected_altitude_fms_ft: Some(int(5000)),
            selected_heading_deg: Some(real(210.2)),
            baro_setting_hpa: Some(real(1013.6)),
            nac_p: Some(int(9)),
            wind_speed_kt: Some(real(35.0)),
            wind_dir_deg: Some(real(270.0)),
            oat_c: Some(real(-52.0)),
            tat_c: Some(real(-25.0)),
            registry: Some(Registry {
                registration: Some("TEST-01".into()),
                type_designator: Some("B789".into()),
                type_description: Some("TEST TYPE".into()),
            }),
        }
    }

    /// The aircraft in the pinned bytes, which the scope's tests read back.
    fn pinned_aircraft() -> Vec<Aircraft> {
        let on_the_ground = Aircraft {
            address: Some(Address::new(0x00d0_0002, AddressType::NonIcao)),
            reception: Some(Reception {
                messages: 2,
                rssi_dbfs: None,
                heard_ms: NOW_MS,
            }),
            identification: Some(Identification {
                callsign: None,
                emitter_category: Some(EmitterCategory::C1SurfaceEmergencyVehicle.into()),
                heard_ms: HEARD_MS,
            }),
            position: Some(Position {
                lat_deg: 33.25,
                lon_deg: 130.25,
                source: Source::Mlat.into(),
                nic: 0,
                rc_m: None,
                heard_ms: NOW_MS,
            }),
            modes: Some(Modes {
                heard_ms: HEARD_MS,
                ..Modes::default()
            }),
            mode_a_code: Some(int(0o7700)),
            emergency: Some(emergency(EmergencyPriorityStatus::GeneralEmergency)),
            on_ground: Some(flag(true)),
            ..Aircraft::default()
        };
        let rebroadcast = Aircraft {
            address: Some(Address::new(0x00d0_0003, AddressType::Icao)),
            position: Some(Position {
                lat_deg: 33.0,
                lon_deg: 130.0,
                source: Source::Tisb.into(),
                nic: 6,
                rc_m: Some(926),
                heard_ms: HEARD_MS,
            }),
            baro_altitude_ft: Some(int(0)),
            ..Aircraft::default()
        };
        let bare = Aircraft {
            address: Some(Address::new(0x00d0_0004, AddressType::Icao)),
            ..Aircraft::default()
        };
        vec![known_in_full(), on_the_ground, rebroadcast, bare]
    }

    /// Run with `BLESS=1` to write the bytes after a deliberate change.
    #[test]
    fn snapshot_encodes_to_the_pinned_bytes() {
        // Arrange
        let pinned = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../proto/testdata/snapshot.bin"
        );
        let frame = Frame::from(Snapshot {
            now_ms: NOW_MS,
            messages: 42,
            aircraft: pinned_aircraft(),
        });
        if std::env::var_os("BLESS").is_some() {
            std::fs::write(pinned, frame.encode_to_vec()).expect("writable");
        }

        // Act
        let encoded = frame.encode_to_vec();

        // Assert
        assert_eq!(encoded, std::fs::read(pinned).expect("readable"));
    }
}
