//! The stations that issue METARs, as the Aviation Weather Center lists them.

use std::io::Read;

use flate2::read::GzDecoder;
use serde::Deserialize;

use crate::Failure;

/// A station that issues METARs, and where it stands.
#[derive(Clone, Debug, PartialEq)]
pub struct Station {
    /// Its ICAO identifier.
    pub id: String,
    pub lat_deg: f64,
    pub lon_deg: f64,
}

impl Station {
    /// How far the station stands from the site, along the geodesic.
    #[must_use]
    pub fn distance_nm(&self, site: (f64, f64)) -> f64 {
        geodesy::inverse(site, (self.lat_deg, self.lon_deg)).distance_nm
    }
}

/// Every station that issues METARs.
#[derive(Default)]
pub struct Stations(Vec<Station>);

/// One site of the list, which has sites of every kind, some without an
/// ICAO identifier or a position.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Site {
    icao_id: Option<String>,
    lat: Option<f64>,
    lon: Option<f64>,
    #[serde(default, rename = "siteType")]
    kinds: Vec<String>,
}

impl Site {
    fn station(self) -> Option<Station> {
        if !self.kinds.iter().any(|kind| kind == "METAR") {
            return None;
        }
        Some(Station {
            id: self.icao_id?,
            lat_deg: self.lat?,
            lon_deg: self.lon?,
        })
    }
}

impl Stations {
    /// Reads the list as published: a gzipped JSON array of every site the
    /// Center knows, of which those that issue METARs under an ICAO
    /// identifier are kept.
    ///
    /// # Errors
    ///
    /// When the bytes are not that.
    pub fn read(published: &[u8]) -> Result<Self, Failure> {
        let mut json = Vec::new();
        GzDecoder::new(published).read_to_end(&mut json)?;
        let sites: Vec<Site> = serde_json::from_slice(&json)?;
        Ok(Self(sites.into_iter().filter_map(Site::station).collect()))
    }

    #[must_use]
    pub fn known(&self) -> usize {
        self.0.len()
    }

    /// The stations within `range_nm` of the site, nearest first.
    #[must_use]
    pub fn within(&self, site: (f64, f64), range_nm: f64) -> Vec<Station> {
        let mut near: Vec<(f64, &Station)> = self
            .0
            .iter()
            .map(|station| (station.distance_nm(site), station))
            .filter(|(distance_nm, _)| *distance_nm <= range_nm)
            .collect();
        near.sort_by(|a, b| a.0.total_cmp(&b.0));
        near.into_iter()
            .map(|(_, station)| station.clone())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use flate2::Compression;
    use flate2::write::GzEncoder;

    use super::{Station, Stations};

    /// Tokyo/Haneda, where the receiver stands in these tests.
    const SITE: (f64, f64) = (35.553, 139.781);

    /// The list as published: every kind of site, by its identifier and type.
    fn published(sites: &[(Option<&str>, f64, f64, &[&str])]) -> Vec<u8> {
        let records: Vec<String> = sites
            .iter()
            .map(|(id, lat, lon, types)| {
                let id = id.map_or("null".to_owned(), |id| format!("\"{id}\""));
                let types: Vec<String> = types.iter().map(|t| format!("\"{t}\"")).collect();
                format!(
                    r#"{{"id":"x","icaoId":{id},"site":"Somewhere","lat":{lat},"lon":{lon},"elev":0,"priority":4,"siteType":[{}]}}"#,
                    types.join(",")
                )
            })
            .collect();
        let json = format!("[{}]", records.join(","));
        let mut gz = GzEncoder::new(Vec::new(), Compression::default());
        gz.write_all(json.as_bytes()).expect("writes");
        gz.finish().expect("finishes")
    }

    fn station(id: &str, (lat_deg, lon_deg): (f64, f64)) -> Station {
        Station {
            id: id.to_owned(),
            lat_deg,
            lon_deg,
        }
    }

    /// The position `distance_nm` north of the site.
    fn north_of_site(distance_nm: f64) -> (f64, f64) {
        let leg = geodesy::Leg {
            distance_nm,
            bearing_deg: 0.0,
        };
        geodesy::direct(SITE, leg)
    }

    #[test]
    fn list_keeps_the_stations_that_issue_metars_under_an_icao_identifier() {
        // Arrange
        let published = published(&[
            (Some("RJTT"), 35.553, 139.781, &["METAR", "TAF"]),
            (Some("RJAA"), 35.765, 140.386, &["METAR"]),
            (Some("RJTF"), 35.671, 139.528, &["TAF"]),
            (None, 35.0, 139.0, &["METAR"]),
            (Some("47662"), 35.692, 139.692, &[]),
        ]);

        // Act
        let stations = Stations::read(&published).map(|s| s.within(SITE, 1000.0));

        // Assert
        assert_eq!(
            stations.map_err(|e| e.to_string()),
            Ok(vec![
                station("RJTT", (35.553, 139.781)),
                station("RJAA", (35.765, 140.386)),
            ])
        );
    }

    #[test]
    fn stations_within_range_come_nearest_first() {
        // Arrange
        let near = north_of_site(149.0);
        let far = north_of_site(151.0);
        let published = published(&[
            (Some("FAR1"), far.0, far.1, &["METAR"]),
            (Some("NEAR"), near.0, near.1, &["METAR"]),
            (Some("RJTT"), SITE.0, SITE.1, &["METAR"]),
        ]);
        let stations = Stations::read(&published).expect("reads");

        // Act
        let within = stations.within(SITE, 150.0);

        // Assert
        assert_eq!(
            within.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(),
            ["RJTT", "NEAR"]
        );
    }

    #[test]
    fn list_refuses_what_is_not_the_gzipped_json() {
        // Arrange
        let published = b"<html>sorry</html>";

        // Act
        let stations = Stations::read(published);

        // Assert
        assert!(stations.is_err());
    }
}
