//! readsb's `aircraft.json` and `receiver.json`, read into the feed's messages.
//!
//! The field names and values are those of readsb's `README-json.md`.

use serde::de::Error as _;
use serde_json::{Map, Value};

use crate::proto::{
    Address, AddressType, AirGroundState, Aircraft, LastPosition, Meteo, Quality, Receiver,
    Reception, Registry, RoughPosition, Snapshot, Source, TargetState, target_state::Modes,
};

/// Reads a `receiver.json`: the receiver's position, when it gives one.
///
/// # Errors
///
/// When the document is not a JSON object.
pub fn parse_receiver(json: &[u8]) -> Result<Receiver, serde_json::Error> {
    let document: Map<String, Value> = serde_json::from_slice(json)?;
    let fields = Fields(&document);
    Ok(Receiver {
        lat_deg: fields.number("lat"),
        lon_deg: fields.number("lon"),
    })
}

/// Reads an `aircraft.json`. An aircraft without a readable address is left
/// out; any other field that cannot be read is left unknown.
///
/// # Errors
///
/// When the document is not JSON or lacks the snapshot's own fields.
pub fn parse_snapshot(json: &[u8]) -> Result<Snapshot, serde_json::Error> {
    let document: Map<String, Value> = serde_json::from_slice(json)?;
    let fields = Fields(&document);
    let missing = serde_json::Error::missing_field;
    let aircraft = document.get("aircraft").and_then(Value::as_array);
    Ok(Snapshot {
        now_s: fields.number("now").ok_or_else(|| missing("now"))?,
        messages: fields
            .whole("messages")
            .ok_or_else(|| missing("messages"))?,
        aircraft: aircraft
            .ok_or_else(|| missing("aircraft"))?
            .iter()
            .filter_map(|aircraft| Fields(aircraft.as_object()?).aircraft())
            .collect(),
    })
}

/// One JSON object, read by field name.
struct Fields<'a>(&'a Map<String, Value>);

impl<'a> Fields<'a> {
    fn number(&self, key: &str) -> Option<f64> {
        self.0.get(key)?.as_f64()
    }

    fn whole<T: TryFrom<i64>>(&self, key: &str) -> Option<T> {
        whole(self.number(key)?)
    }

    fn text(&self, key: &str) -> Option<&'a str> {
        self.0.get(key)?.as_str()
    }

    fn owned(&self, key: &str) -> Option<String> {
        self.text(key).map(str::to_owned)
    }

    fn object(&self, key: &str) -> Option<Self> {
        self.0.get(key)?.as_object().map(Fields)
    }

    fn list(&self, key: &str) -> Option<Vec<&'a str>> {
        let items = self.0.get(key)?.as_array()?;
        Some(items.iter().filter_map(Value::as_str).collect())
    }

    fn aircraft(&self) -> Option<Aircraft> {
        let altitude = self.0.get("alt_baro");
        let on_ground = altitude.and_then(Value::as_str) == Some("ground");
        Some(Aircraft {
            address: Some(address(self.text("hex")?)?),
            identification: self.text("flight").and_then(identification),
            emitter_category: self.text("category").and_then(emitter_category),
            mode_a_code: self.text("squawk").and_then(mode_a_code),
            emergency_priority_status: self.text("emergency").and_then(emergency),
            lat_deg: self.number("lat"),
            lon_deg: self.number("lon"),
            position_source: self.position_source().into(),
            air_ground_state: if on_ground {
                AirGroundState::OnGround.into()
            } else {
                AirGroundState::Unspecified.into()
            },
            baro_altitude_ft: self.whole("alt_baro"),
            geometric_altitude_ft: self.whole("alt_geom"),
            last_position: self
                .object("lastPosition")
                .and_then(|last| last.last_position()),
            rough_position: self
                .number("rr_lat")
                .zip(self.number("rr_lon"))
                .map(|(lat_deg, lon_deg)| RoughPosition { lat_deg, lon_deg }),
            ground_speed_kt: self.number("gs"),
            track_deg: self.number("track"),
            baro_vertical_rate_fpm: self.whole("baro_rate"),
            indicated_airspeed_kt: self.number("ias"),
            true_airspeed_kt: self.number("tas"),
            mach: self.number("mach"),
            target_state: known(TargetState {
                selected_altitude_mcp_ft: self.whole("nav_altitude_mcp"),
                selected_altitude_fms_ft: self.whole("nav_altitude_fms"),
                selected_heading_deg: self.number("nav_heading"),
                baro_setting_hpa: self.number("nav_qnh"),
                modes: self.list("nav_modes").map(|names| modes(&names)),
            }),
            quality: known(Quality {
                nic: self.whole("nic"),
                nac_p: self.whole("nac_p"),
            }),
            meteo: known(Meteo {
                wind_speed_kt: self.number("ws"),
                wind_dir_deg: self.number("wd"),
                oat_c: self.number("oat"),
                tat_c: self.number("tat"),
            }),
            registry: known(Registry {
                registration: self.owned("r"),
                type_designator: self.owned("t"),
                type_description: self.owned("desc"),
            }),
            reception: known(Reception {
                messages: self.whole("messages"),
                rssi_dbfs: self.number("rssi"),
                seen_s: self.number("seen"),
                seen_pos_s: self.number("seen_pos"),
            }),
        })
    }

    fn last_position(&self) -> Option<LastPosition> {
        Some(LastPosition {
            lat_deg: self.number("lat")?,
            lon_deg: self.number("lon")?,
            nic: self.whole("nic"),
            rc_m: self.whole("rc"),
            seen_pos_s: self.number("seen_pos")?,
        })
    }

    /// readsb lists under `mlat` and `tisb` the fields that came that way.
    fn position_source(&self) -> Source {
        let came_by = |key| self.list(key).is_some_and(|fields| fields.contains(&"lat"));
        let positioned = self.number("lat").is_some() && self.number("lon").is_some();
        match (positioned, came_by("mlat"), came_by("tisb")) {
            (true, true, _) => Source::Mlat,
            (true, false, true) => Source::Tisb,
            _ => Source::Unspecified,
        }
    }
}

/// Rounded, and unknown when outside the type's range.
pub(crate) fn whole<T: TryFrom<i64>>(value: f64) -> Option<T> {
    #[allow(clippy::cast_possible_truncation)]
    let rounded = value.round() as i64;
    T::try_from(rounded).ok()
}

/// A group of fields, unless none of them is known.
fn known<T: Default + PartialEq>(group: T) -> Option<T> {
    Some(group).filter(|group| *group != T::default())
}

/// Six hex digits; readsb prefixes a non-ICAO address with `~`.
pub(crate) fn address(hex: &str) -> Option<Address> {
    let (digits, r#type) = match hex.strip_prefix('~') {
        Some(digits) => (digits, AddressType::NonIcao),
        None => (hex, AddressType::Icao),
    };
    let value = u32::from_str_radix(digits, 16)
        .ok()
        .filter(|_| digits.len() == 6)?;
    Some(Address {
        value,
        r#type: r#type.into(),
    })
}

pub(crate) fn identification(flight: &str) -> Option<String> {
    Some(flight.trim_end())
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
}

fn mode_a_code(squawk: &str) -> Option<u32> {
    u32::from_str_radix(squawk, 8)
        .ok()
        .filter(|_| squawk.len() == 4)
}

/// `A0` to `D7`, numbered as the schema's `EmitterCategory`.
fn emitter_category(category: &str) -> Option<i32> {
    let [set, code] = category.as_bytes() else {
        return None;
    };
    let set = b"ABCD".iter().position(|letter| letter == set)?;
    let code = char::from(*code).to_digit(8)?;
    i32::try_from(set * 8 + usize::try_from(code).ok()?).ok()
}

/// Numbered as the schema's `EmergencyPriorityStatus`.
fn emergency(name: &str) -> Option<i32> {
    const NAMES: [&str; 8] = [
        "none",
        "general",
        "lifeguard",
        "minfuel",
        "nordo",
        "unlawful",
        "downed",
        "reserved",
    ];
    i32::try_from(NAMES.iter().position(|known| *known == name)?).ok()
}

fn modes(names: &[&str]) -> Modes {
    Modes {
        autopilot: names.contains(&"autopilot"),
        vnav: names.contains(&"vnav"),
        altitude_hold: names.contains(&"althold"),
        approach: names.contains(&"approach"),
        lnav: names.contains(&"lnav"),
        tcas: names.contains(&"tcas"),
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_receiver, parse_snapshot};
    use crate::proto::{
        Address, AddressType, AirGroundState, Aircraft, LastPosition, Meteo, Quality, Receiver,
        Reception, Registry, RoughPosition, Snapshot, Source, TargetState, target_state::Modes,
    };

    const ADDRESS: Address = Address {
        value: 0x00d0_0001,
        r#type: AddressType::Icao as i32,
    };

    fn only_aircraft(fields: &str) -> Aircraft {
        let json = format!(r#"{{"now":1,"messages":0,"aircraft":[{{{fields}}}]}}"#);
        let mut snapshot = parse_snapshot(json.as_bytes()).expect("parses");
        assert_eq!(snapshot.aircraft.len(), 1, "precondition: one aircraft");
        snapshot.aircraft.remove(0)
    }

    #[test]
    fn every_field_is_read_in_the_spec_s_terms() {
        // Arrange
        let json = br#"{"now":1700000000.5,"messages":42,"aircraft":[{
            "hex":"d00001","flight":"TEST01  ","squawk":"7700","category":"A3","emergency":"general",
            "lat":1.5,"lon":-2.5,"alt_baro":35000,"alt_geom":35625,
            "rr_lat":5.5,"rr_lon":-6.5,
            "lastPosition":{"lat":3.5,"lon":-4.5,"nic":8,"rc":186,"seen_pos":75.1},
            "gs":451.2,"track":182.9,"baro_rate":-832,"ias":280,"tas":440,"mach":0.78,
            "nav_altitude_mcp":6000,"nav_altitude_fms":5000,"nav_heading":210.2,"nav_qnh":1013.6,
            "nav_modes":["autopilot","vnav","althold","approach","lnav","tcas"],
            "nic":8,"nac_p":9,"ws":35,"wd":270,"oat":-52,"tat":-25,
            "r":"TEST-01","t":"B789","desc":"TEST TYPE",
            "messages":1234,"rssi":-12.5,"seen":0.3,"seen_pos":1.2,
            "mlat":[],"tisb":[],"calc_track":12
        }]}"#;

        // Act
        let snapshot = parse_snapshot(json);

        // Assert
        let expected = Aircraft {
            address: Some(ADDRESS),
            identification: Some("TEST01".into()),
            emitter_category: Some(3),
            mode_a_code: Some(0o7700),
            emergency_priority_status: Some(1),
            lat_deg: Some(1.5),
            lon_deg: Some(-2.5),
            position_source: Source::Unspecified.into(),
            air_ground_state: AirGroundState::Unspecified.into(),
            baro_altitude_ft: Some(35_000),
            geometric_altitude_ft: Some(35_625),
            last_position: Some(LastPosition {
                lat_deg: 3.5,
                lon_deg: -4.5,
                nic: Some(8),
                rc_m: Some(186),
                seen_pos_s: 75.1,
            }),
            rough_position: Some(RoughPosition {
                lat_deg: 5.5,
                lon_deg: -6.5,
            }),
            ground_speed_kt: Some(451.2),
            track_deg: Some(182.9),
            baro_vertical_rate_fpm: Some(-832),
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
        };
        assert_eq!(
            snapshot.ok(),
            Some(Snapshot {
                now_s: 1_700_000_000.5,
                messages: 42,
                aircraft: vec![expected]
            })
        );
    }

    #[test]
    fn bare_address_leaves_everything_else_unknown() {
        // Arrange
        let fields = r#""hex":"d00001""#;

        // Act
        let aircraft = only_aircraft(fields);

        // Assert
        assert_eq!(
            aircraft,
            Aircraft {
                address: Some(ADDRESS),
                ..Aircraft::default()
            }
        );
    }

    #[test]
    fn mistyped_field_is_unknown() {
        // Arrange
        let fields = r#""hex":"d00001","gs":"fast","flight":7,"nav_modes":"all""#;

        // Act
        let aircraft = only_aircraft(fields);

        // Assert
        assert_eq!(
            aircraft,
            Aircraft {
                address: Some(ADDRESS),
                ..Aircraft::default()
            }
        );
    }

    #[test]
    fn snapshot_without_its_own_fields_is_rejected() {
        // Arrange
        let documents: [&[u8]; 3] = [
            br#"{"now":1,"messages":0}"#,
            br#"{"messages":0,"aircraft":[]}"#,
            b"not json",
        ];

        // Act
        let snapshots = documents.map(parse_snapshot);

        // Assert
        assert!(snapshots.iter().all(Result::is_err));
    }

    #[test]
    fn fractional_message_count_is_rounded() {
        // Arrange
        let json = br#"{"now":1,"messages":41.6,"aircraft":[]}"#;

        // Act
        let snapshot = parse_snapshot(json);

        // Assert
        assert_eq!(snapshot.ok().map(|snapshot| snapshot.messages), Some(42));
    }

    #[test]
    fn aircraft_without_a_readable_address_is_dropped() {
        // Arrange
        let json = br#"{"now":1,"messages":0,"aircraft":[
            {"hex":"zzzzzz"},{"hex":"1d00001"},{"flight":"TEST01"},7,{"hex":"d00001"}]}"#;

        // Act
        let snapshot = parse_snapshot(json);

        // Assert
        let addresses: Vec<Option<Address>> = snapshot
            .expect("parses")
            .aircraft
            .iter()
            .map(|a| a.address)
            .collect();
        assert_eq!(addresses, [Some(ADDRESS)]);
    }

    #[test]
    fn tilde_marks_a_non_icao_address() {
        // Arrange
        let fields = r#""hex":"~d00001""#;

        // Act
        let aircraft = only_aircraft(fields);

        // Assert
        let non_icao = Address {
            r#type: AddressType::NonIcao.into(),
            ..ADDRESS
        };
        assert_eq!(aircraft.address, Some(non_icao));
    }

    #[test]
    fn blank_identification_is_unknown() {
        // Arrange
        let fields = r#""hex":"d00001","flight":"        ""#;

        // Act
        let aircraft = only_aircraft(fields);

        // Assert
        assert_eq!(aircraft.identification, None);
    }

    #[test]
    fn ground_replaces_the_barometric_altitude() {
        // Arrange
        let fields = r#""hex":"d00001","alt_baro":"ground""#;

        // Act
        let aircraft = only_aircraft(fields);

        // Assert
        assert_eq!(aircraft.baro_altitude_ft, None);
        assert_eq!(aircraft.air_ground_state(), AirGroundState::OnGround);
    }

    #[test]
    fn position_source_is_what_the_position_came_by() {
        // Arrange
        let cases = [
            r#""lat":1.5,"lon":-2.5,"mlat":["lat","lon"]"#,
            r#""lat":1.5,"lon":-2.5,"tisb":["lat","lon"]"#,
            r#""lat":1.5,"lon":-2.5,"mlat":["gs"]"#,
            r#""mlat":["lat","lon"]"#,
        ];

        // Act
        let sources =
            cases.map(|case| only_aircraft(&format!(r#""hex":"d00001",{case}"#)).position_source());

        // Assert
        assert_eq!(
            sources,
            [
                Source::Mlat,
                Source::Tisb,
                Source::Unspecified,
                Source::Unspecified
            ]
        );
    }

    #[test]
    fn modes_reported_as_none_engaged_are_kept() {
        // Arrange
        let fields = r#""hex":"d00001","nav_modes":[]"#;

        // Act
        let aircraft = only_aircraft(fields);

        // Assert
        assert_eq!(
            aircraft.target_state.and_then(|target| target.modes),
            Some(Modes::default())
        );
    }

    #[test]
    fn category_is_numbered_by_set_and_code() {
        // Arrange
        let categories = ["A0", "A7", "B1", "C3", "D7", "E1", "A8", "A", "A10", ""];

        // Act
        let read = categories.map(|category| {
            only_aircraft(&format!(r#""hex":"d00001","category":"{category}""#)).emitter_category
        });

        // Assert
        let expected = [
            Some(0),
            Some(7),
            Some(9),
            Some(19),
            Some(31),
            None,
            None,
            None,
            None,
            None,
        ];
        assert_eq!(read, expected);
    }

    #[test]
    fn emergency_follows_the_name() {
        // Arrange
        let names = [
            "none",
            "general",
            "lifeguard",
            "minfuel",
            "nordo",
            "unlawful",
            "downed",
            "reserved",
            "unheard_of",
        ];

        // Act
        let codes = names.map(|name| {
            only_aircraft(&format!(r#""hex":"d00001","emergency":"{name}""#))
                .emergency_priority_status
        });

        // Assert
        let expected = [
            Some(0),
            Some(1),
            Some(2),
            Some(3),
            Some(4),
            Some(5),
            Some(6),
            Some(7),
            None,
        ];
        assert_eq!(codes, expected);
    }

    #[test]
    fn squawk_outside_four_octal_digits_is_unknown() {
        // Arrange
        let squawks = ["0000", "7777", "8000", "77777", "12", ""];

        // Act
        let codes = squawks.map(|squawk| {
            only_aircraft(&format!(r#""hex":"d00001","squawk":"{squawk}""#)).mode_a_code
        });

        // Assert
        assert_eq!(codes, [Some(0), Some(0o7777), None, None, None, None]);
    }

    #[test]
    fn receiver_gives_its_position() {
        // Arrange
        let json = br#"{"refresh":1000,"lat":33.5844,"lon":130.4517,"version":"test"}"#; // RJFF

        // Act
        let receiver = parse_receiver(json);

        // Assert
        let expected = Receiver {
            lat_deg: Some(33.5844),
            lon_deg: Some(130.4517),
        };
        assert_eq!(receiver.ok(), Some(expected));
    }

    #[test]
    fn receiver_without_a_position_is_still_a_receiver() {
        // Arrange
        let json = br#"{"refresh":1000,"lat":"north"}"#;

        // Act
        let receiver = parse_receiver(json);

        // Assert
        assert_eq!(receiver.ok(), Some(Receiver::default()));
    }

    #[test]
    fn receiver_that_is_not_an_object_is_refused() {
        // Arrange
        let documents: [&[u8]; 2] = [b"[1,2]", b"not json"];

        // Act
        let receivers = documents.map(parse_receiver);

        // Assert
        assert!(receivers.iter().all(Result::is_err));
    }
}

/// The scope's decoder is tested against the same two files.
#[cfg(test)]
mod wire {
    use std::path::PathBuf;

    use prost::Message;

    use super::parse_snapshot;
    use crate::proto::Frame;

    fn testdata(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../proto/testdata")
            .join(name)
    }

    /// Run with `BLESS=1` to write the bytes after a deliberate change.
    #[test]
    fn snapshot_encodes_to_the_pinned_bytes() {
        // Arrange
        let document = std::fs::read(testdata("snapshot.json")).expect("readable");
        let snapshot = parse_snapshot(&document).expect("parses");
        if std::env::var_os("BLESS").is_some() {
            let frame = Frame::from(snapshot.clone()).encode_to_vec();
            std::fs::write(testdata("snapshot.bin"), frame).expect("writable");
        }
        let pinned = std::fs::read(testdata("snapshot.bin")).expect("readable");

        // Act
        let encoded = Frame::from(snapshot).encode_to_vec();

        // Assert
        assert_eq!(encoded, pinned);
    }
}
