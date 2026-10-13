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
