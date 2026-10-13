//! The stations that issue METARs, as the Aviation Weather Center lists them.

use std::time::Duration;

use metar::stations::Stations;

use crate::Failure;
use crate::mirror::Publication;

/// Where the Center publishes its list of every site it knows, renewed daily.
pub const URL: &str = "https://aviationweather.gov/data/cache/stations.cache.json.gz";
/// Where the copy is kept, within the data directory.
pub const FILE: &str = "papaquebec/metar-stations.json.gz";

impl Publication for Stations {
    const NAME: &str = "METAR stations";
    const RENEW_AT: Duration = Duration::from_hours(24);

    fn read(published: &[u8]) -> Result<Self, Failure> {
        Stations::read(published)
    }

    fn tally(&self) -> String {
        format!("{} stations", self.known())
    }
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use flate2::Compression;
    use flate2::write::GzEncoder;
    use metar::stations::Stations;

    use crate::mirror::Publication;

    /// The list as published: one station that issues METARs, and one that does not.
    fn zipped() -> Vec<u8> {
        let json = r#"[
            {"id":"RJTT","icaoId":"RJTT","site":"Tokyo/Haneda Intl","lat":35.553,"lon":139.781,"elev":5,"priority":0,"siteType":["METAR","TAF"]},
            {"id":"RJTF","icaoId":"RJTF","site":"Chofu","lat":35.671,"lon":139.528,"elev":43,"priority":4,"siteType":["TAF"]}
        ]"#;
        let mut gz = GzEncoder::new(Vec::new(), Compression::default());
        gz.write_all(json.as_bytes()).expect("writes");
        gz.finish().expect("finishes")
    }

    #[test]
    fn list_reads_into_the_stations_and_tallies_them() {
        // Arrange
        let published = zipped();

        // Act
        let read = <Stations as Publication>::read(&published)
            .map(|stations| (stations.known(), stations.tally()))
            .map_err(|failure| failure.to_string());

        // Assert
        assert_eq!(read, Ok((1, "1 stations".to_owned())));
    }
}
