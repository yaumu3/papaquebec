//! tar1090's own history: `chunks/chunks.json` names gzipped chunk files, each
//! holding `files`, compact snapshots whose aircraft are
//! `[hex, alt_baro, gs, track, lat, lon, seen, type, flight, messages]`.

use std::io::Read;

use flate2::read::GzDecoder;
use serde_json::Value;

use crate::Failure;
use crate::proto::{AirGroundState, Aircraft, Reception, Snapshot, Source};
use crate::readsb::{address, identification, whole};

/// The chunk files tar1090 would load, from `chunks.json`; none when it cannot be read.
pub fn parse_index(json: &[u8]) -> Vec<String> {
    let index: Value = serde_json::from_slice(json).unwrap_or_default();
    let chunks = index.get("chunks").and_then(Value::as_array);
    let names = chunks.into_iter().flatten().filter_map(Value::as_str);
    names.map(str::to_owned).collect()
}

/// The snapshots in one chunk file.
///
/// # Errors
///
/// When the chunk is not gzipped JSON.
pub fn parse_chunk(gzipped: &[u8]) -> Result<Vec<Snapshot>, Failure> {
    let mut json = Vec::new();
    GzDecoder::new(gzipped).read_to_end(&mut json)?;
    let chunk: Value = serde_json::from_slice(&json)?;
    let files = chunk.get("files").and_then(Value::as_array);
    Ok(files.into_iter().flatten().filter_map(snapshot).collect())
}

fn snapshot(file: &Value) -> Option<Snapshot> {
    let rows = file.get("aircraft")?.as_array()?;
    Some(Snapshot {
        now_s: file.get("now")?.as_f64()?,
        messages: file.get("messages").and_then(Value::as_u64).unwrap_or(0),
        aircraft: rows
            .iter()
            .filter_map(|row| aircraft(row.as_array()?))
            .collect(),
    })
}

/// One compact record; none without a position, since history is for trails.
fn aircraft(row: &[Value]) -> Option<Aircraft> {
    let field = |at: usize| row.get(at).filter(|value| !value.is_null());
    let number = |at| field(at).and_then(Value::as_f64);
    let text = |at| field(at).and_then(Value::as_str);
    let seen = number(6);
    let source = match text(7) {
        Some(kind) if kind.starts_with("mlat") => Source::Mlat,
        Some(kind) if kind.starts_with("tisb") => Source::Tisb,
        _ => Source::Unspecified,
    };
    let air_ground = if text(1) == Some("ground") {
        AirGroundState::OnGround
    } else {
        AirGroundState::Unspecified
    };
    Some(Aircraft {
        address: Some(address(text(0)?)?),
        lat_deg: Some(number(4)?),
        lon_deg: Some(number(5)?),
        position_source: source.into(),
        air_ground_state: air_ground.into(),
        baro_altitude_ft: number(1).and_then(whole),
        ground_speed_kt: number(2),
        track_deg: number(3),
        identification: text(8).and_then(identification),
        reception: Some(Reception {
            messages: number(9).and_then(whole),
            seen_s: seen,
            seen_pos_s: seen,
            ..Reception::default()
        }),
        ..Aircraft::default()
    })
}

#[cfg(test)]
pub(super) mod tests {
    use std::io::Write;

    use flate2::Compression;
    use flate2::write::GzEncoder;

    use super::{parse_chunk, parse_index};
    use crate::proto::{
        Address, AddressType, AirGroundState, Aircraft, Reception, Snapshot, Source,
    };

    pub(crate) fn gzip(json: &str) -> Vec<u8> {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(json.as_bytes()).expect("writes");
        encoder.finish().expect("finishes")
    }

    fn address(value: u32) -> Address {
        Address {
            value,
            r#type: AddressType::Icao.into(),
        }
    }

    #[test]
    fn index_lists_the_chunk_files_tar1090_would_load() {
        // Arrange
        let json = br#"{"chunks":["chunk_1.gz","current_large.gz",7],"chunks_all":["x"]}"#;

        // Act
        let files = parse_index(json);

        // Assert
        assert_eq!(files, ["chunk_1.gz", "current_large.gz"]);
    }

    #[test]
    fn index_of_anything_else_is_empty() {
        // Arrange
        let documents: [&[u8]; 3] = [b"null", b"{}", br#"{"chunks":"nope"}"#];

        // Act
        let files = documents.map(parse_index);

        // Assert
        assert!(files.iter().all(Vec::is_empty));
    }

    #[test]
    fn chunk_expands_compact_records_into_snapshots() {
        // Arrange
        let chunk = gzip(
            r#"{"files":[
                {"now":1000.5,"messages":42,"aircraft":[
                    ["d00010",33250,450,92.1,36.9,139.0,1.7,"adsb_icao","TEST03  ",9],
                    ["d00123","ground",null,null,35.7,140.3,0.2,"mlat",null,3],
                    ["d00456",5000,200,10,35.8,140.4,0.5,"tisb_icao",null,1],
                    ["d00789",5000,200,10,null,null,0.5,"adsb_icao",null,1],
                    ["bad"]
                ]},
                {"now":999,"messages":40,"aircraft":[]}
            ]}"#,
        ); // Nikko, near RJAA

        // Act
        let snapshots = parse_chunk(&chunk);

        // Assert
        let seen = |seen_s, messages| {
            Some(Reception {
                messages: Some(messages),
                seen_s: Some(seen_s),
                seen_pos_s: Some(seen_s),
                ..Reception::default()
            })
        };
        let expected = Snapshot {
            now_s: 1000.5,
            messages: 42,
            aircraft: vec![
                Aircraft {
                    address: Some(address(0x00d0_0010)),
                    identification: Some("TEST03".into()),
                    baro_altitude_ft: Some(33_250),
                    ground_speed_kt: Some(450.0),
                    track_deg: Some(92.1),
                    lat_deg: Some(36.9),
                    lon_deg: Some(139.0),
                    reception: seen(1.7, 9),
                    ..Aircraft::default()
                },
                Aircraft {
                    address: Some(address(0x00d0_0123)),
                    air_ground_state: AirGroundState::OnGround.into(),
                    lat_deg: Some(35.7),
                    lon_deg: Some(140.3),
                    position_source: Source::Mlat.into(),
                    reception: seen(0.2, 3),
                    ..Aircraft::default()
                },
                Aircraft {
                    address: Some(address(0x00d0_0456)),
                    baro_altitude_ft: Some(5000),
                    ground_speed_kt: Some(200.0),
                    track_deg: Some(10.0),
                    lat_deg: Some(35.8),
                    lon_deg: Some(140.4),
                    position_source: Source::Tisb.into(),
                    reception: seen(0.5, 1),
                    ..Aircraft::default()
                },
            ],
        };
        let snapshots = snapshots.expect("reads");
        assert_eq!(snapshots.len(), 2);
        assert_eq!(snapshots[0], expected);
        let empty = Snapshot {
            now_s: 999.0,
            messages: 40,
            aircraft: vec![],
        };
        assert_eq!(snapshots[1], empty);
    }

    #[test]
    fn chunk_that_is_not_gzipped_json_is_refused() {
        // Arrange
        let chunks = [b"{\"files\":[]}".to_vec(), gzip("not json")];

        // Act
        let read = chunks.map(|chunk| parse_chunk(&chunk));

        // Assert
        assert!(read.iter().all(Result::is_err));
    }
}
