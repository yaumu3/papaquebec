//! The aircraft database, as Mictronics publishes it.

use std::time::Duration;

use tracker::registry::Registry;

use crate::Failure;
use crate::mirror::Publication;

/// Where Mictronics publishes the database, which it renews every week.
pub const URL: &str =
    "https://github.com/Mictronics/aircraft-database/raw/refs/heads/main/indexedDB.zip";
/// Where the copy is kept, within the data directory.
pub const FILE: &str = "papaquebec/aircraft-database.zip";

impl Publication for Registry {
    const NAME: &str = "aircraft database";
    /// Mictronics renews the database every week.
    const RENEW_AT: Duration = Duration::from_hours(7 * 24);

    fn read(published: &[u8]) -> Result<Self, Failure> {
        Registry::read(published)
    }

    fn tally(&self) -> String {
        format!("{} aircraft", self.known())
    }
}

#[cfg(test)]
mod tests {
    use std::io::{Cursor, Write};

    use tracker::registry::Registry;
    use zip::ZipWriter;
    use zip::write::SimpleFileOptions;

    use crate::mirror::Publication;

    /// The database as published: one made-up aircraft, from a block ICAO
    /// reserves for future use, and no types.
    fn zipped() -> Vec<u8> {
        let aircraft = r#"{"D00002": ["TEST-02", "B789", "00"]}"#;
        let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
        for (name, contents) in [("aircrafts.json", aircraft), ("types.json", "{}")] {
            zip.start_file(name, SimpleFileOptions::default())
                .expect("starts");
            zip.write_all(contents.as_bytes()).expect("writes");
        }
        zip.finish().expect("finishes").into_inner()
    }

    #[test]
    fn database_reads_into_the_registry_and_tallies_its_aircraft() {
        // Arrange
        let published = zipped();

        // Act
        let read = <Registry as Publication>::read(&published)
            .map(|registry| (registry.registered(0x00d0_0002).is_some(), registry.tally()))
            .map_err(|failure| failure.to_string());

        // Assert
        assert_eq!(read, Ok((true, "1 aircraft".to_owned())));
    }
}
