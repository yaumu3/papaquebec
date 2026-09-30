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
        Address, AddressType, Aircraft, EmergencyPriorityStatus, Frame, Snapshot, frame::Body,
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
}
