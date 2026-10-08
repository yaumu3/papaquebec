//! The feed's wire contract, generated from `proto/papaquebec/feed/v1/feed.proto`.

#[allow(clippy::pedantic)]
mod generated {
    include!(concat!(env!("OUT_DIR"), "/papaquebec.feed.v1.rs"));
}

pub use generated::*;

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

#[cfg(test)]
mod tests {
    use prost::Message;

    use super::{
        Address, AddressType, AirGroundState, Aircraft, EmergencyPriorityStatus, EmitterCategory,
        Frame, LastPosition, Meteo, Quality, Reception, Registry, Snapshot, Source, TargetState,
        frame::Body, target_state::Modes,
    };

    fn frame_of(aircraft: Aircraft) -> Frame {
        Frame {
            body: Some(Body::Snapshot(Snapshot {
                now_s: 1_700_000_000.5,
                messages: 42,
                aircraft: vec![aircraft],
            })),
        }
    }

    #[test]
    fn frame_survives_the_wire() {
        // Arrange
        let frame = frame_of(Aircraft {
            address: Some(Address {
                value: 0x00d0_0001,
                r#type: AddressType::Icao.into(),
            }),
            identification: Some("TEST01".into()),
            baro_altitude_ft: Some(0),
            emergency_priority_status: Some(EmergencyPriorityStatus::NoEmergency.into()),
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
            baro_altitude_ft: Some(0),
            emergency_priority_status: Some(EmergencyPriorityStatus::NoEmergency.into()),
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

    fn address(value: u32, r#type: AddressType) -> Address {
        Address {
            value,
            r#type: r#type.into(),
        }
    }

    /// An aircraft of which the feed carries everything it can in the air.
    fn known_in_full() -> Aircraft {
        Aircraft {
            address: Some(address(0x00d0_0001, AddressType::Icao)),
            identification: Some("TEST01".into()),
            emitter_category: Some(EmitterCategory::A3Large.into()),
            mode_a_code: Some(0o0421),
            emergency_priority_status: Some(EmergencyPriorityStatus::NoEmergency.into()),
            ident: true,
            lat_deg: Some(33.5),
            lon_deg: Some(130.5),
            baro_altitude_ft: Some(35_000),
            geometric_altitude_ft: Some(35_625),
            ground_speed_kt: Some(451.2),
            track_deg: Some(182.9),
            baro_vertical_rate_fpm: Some(-832),
            geometric_vertical_rate_fpm: Some(-768),
            indicated_airspeed_kt: Some(280.0),
            true_airspeed_kt: Some(440.0),
            mach: Some(0.78),
            target_state: Some(TargetState {
                selected_altitude_mcp_ft: Some(6000),
                selected_altitude_fms_ft: Some(5000),
                selected_heading_deg: Some(210.2),
                baro_setting_hpa: Some(1013.6),
                modes: Some(Modes {
                    autopilot: true,
                    vnav: true,
                    altitude_hold: true,
                    approach: true,
                    lnav: true,
                    tcas: true,
                }),
            }),
            quality: Some(Quality {
                nic: Some(8),
                nac_p: Some(9),
            }),
            meteo: Some(Meteo {
                wind_speed_kt: Some(35.0),
                wind_dir_deg: Some(270.0),
                oat_c: Some(-52.0),
                tat_c: Some(-25.0),
            }),
            registry: Some(Registry {
                registration: Some("TEST-01".into()),
                type_designator: Some("B789".into()),
                type_description: Some("TEST TYPE".into()),
            }),
            reception: Some(Reception {
                messages: Some(1234),
                rssi_dbfs: Some(-12.5),
                seen_s: Some(0.3),
                seen_pos_s: Some(1.2),
            }),
            ..Aircraft::default()
        }
    }

    /// The aircraft in the pinned bytes, which the scope's tests read back.
    fn pinned_aircraft() -> Vec<Aircraft> {
        let on_the_ground = Aircraft {
            address: Some(address(0x00d0_0002, AddressType::NonIcao)),
            mode_a_code: Some(0o7700),
            emitter_category: Some(EmitterCategory::C1SurfaceEmergencyVehicle.into()),
            emergency_priority_status: Some(EmergencyPriorityStatus::GeneralEmergency.into()),
            lat_deg: Some(33.25),
            lon_deg: Some(130.25),
            position_source: Source::Mlat.into(),
            air_ground_state: AirGroundState::OnGround.into(),
            target_state: Some(TargetState {
                modes: Some(Modes::default()),
                ..TargetState::default()
            }),
            reception: Some(Reception {
                seen_s: Some(0.0),
                ..Reception::default()
            }),
            ..Aircraft::default()
        };
        let with_a_last_position = Aircraft {
            address: Some(address(0x00d0_0003, AddressType::Icao)),
            lat_deg: Some(33.0),
            lon_deg: Some(130.0),
            position_source: Source::Tisb.into(),
            baro_altitude_ft: Some(0),
            last_position: Some(LastPosition {
                lat_deg: 32.5,
                lon_deg: 129.5,
                nic: Some(8),
                rc_m: Some(186),
                seen_pos_s: 75.5,
            }),
            ..Aircraft::default()
        };
        let bare = Aircraft {
            address: Some(address(0x00d0_0004, AddressType::Icao)),
            ..Aircraft::default()
        };
        vec![known_in_full(), on_the_ground, with_a_last_position, bare]
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
            now_s: 1_700_000_000.5,
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
