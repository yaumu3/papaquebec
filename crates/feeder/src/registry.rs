//! Whose each aircraft is and of what type, by its address: the aircraft
//! database Mictronics publishes under the Open Data Commons Attribution License.

use std::collections::HashMap;
use std::fmt;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use serde::Deserializer;
use serde::de::{MapAccess, Visitor};
use tokio::sync::watch;
use zip::ZipArchive;

use crate::Failure;
use crate::proto::{self, AddressType, Snapshot};

/// The registration and the type of every aircraft the database knows.
#[derive(Default)]
pub struct Registry {
    /// In the order of their addresses.
    aircraft: Vec<Entry>,
    /// The registration and the type designator of each, end to end.
    text: String,
    /// What each type designator stands for.
    types: HashMap<String, String>,
}

/// Where the registration of an address starts in the text, its type designator after it.
struct Entry {
    address: u32,
    at: u32,
    registration_len: u8,
    designator_len: u8,
}

impl Registry {
    /// Reads the database as it is published: a zip of `aircrafts.json`, which
    /// gives a registration and a type designator by address, and
    /// `types.json`, which describes each designator.
    ///
    /// # Errors
    ///
    /// When it is not such a zip.
    pub fn read(zip: &[u8]) -> Result<Self, Failure> {
        let mut archive = ZipArchive::new(Cursor::new(zip))?;
        let types: HashMap<String, Vec<String>> =
            serde_json::from_slice(&file(&mut archive, "types.json")?)?;
        let described = types.into_iter().filter_map(|(designator, described)| {
            Some((designator, described.into_iter().next()?))
        });
        let mut registry = Self {
            types: described.collect(),
            ..Self::default()
        };
        let aircraft = file(&mut archive, "aircrafts.json")?;
        serde_json::Deserializer::from_slice(&aircraft).deserialize_map(&mut registry)?;
        registry
            .aircraft
            .sort_unstable_by_key(|entry| entry.address);
        Ok(registry)
    }

    /// Takes the aircraft at the address written in hexadecimal, with its
    /// registration and then its type designator; one that has neither is left out.
    fn push(&mut self, address: &str, fields: &[String]) {
        let field = |at: usize| fields.get(at).map_or("", String::as_str);
        let (registration, designator) = (field(0), field(1));
        let entry = || {
            Some(Entry {
                address: u32::from_str_radix(address, 16).ok()?,
                at: u32::try_from(self.text.len()).ok()?,
                registration_len: u8::try_from(registration.len()).ok()?,
                designator_len: u8::try_from(designator.len()).ok()?,
            })
        };
        if let Some(entry) = entry().filter(|_| !(registration.is_empty() && designator.is_empty()))
        {
            self.aircraft.push(entry);
            self.text.push_str(registration);
            self.text.push_str(designator);
        }
    }

    /// What is registered under the ICAO address; none when the database does not know it.
    #[must_use]
    pub fn registered(&self, address: u32) -> Option<proto::Registry> {
        let found = self
            .aircraft
            .binary_search_by_key(&address, |entry| entry.address);
        let entry = &self.aircraft[found.ok()?];
        let (registration, designator) =
            self.text[entry.at as usize..].split_at_checked(usize::from(entry.registration_len))?;
        let designator = designator.get(..usize::from(entry.designator_len))?;
        let known = |text: &str| {
            Some(text)
                .filter(|text| !text.is_empty())
                .map(str::to_owned)
        };
        Some(proto::Registry {
            registration: known(registration),
            type_designator: known(designator),
            type_description: self.types.get(designator).cloned(),
        })
    }

    /// Gives every aircraft with an ICAO address what is registered under it.
    pub fn fill(&self, snapshot: &mut Snapshot) {
        for aircraft in &mut snapshot.aircraft {
            let icao = aircraft
                .address
                .filter(|address| address.r#type() == AddressType::Icao);
            aircraft.registry = icao.and_then(|address| self.registered(address.value));
        }
    }
}

/// Aircraft by their address, each with its registration and its type designator.
impl FromIterator<(u32, String, String)> for Registry {
    fn from_iter<I: IntoIterator<Item = (u32, String, String)>>(aircraft: I) -> Self {
        let mut registry = Self::default();
        for (address, registration, designator) in aircraft {
            registry.push(&format!("{address:x}"), &[registration, designator]);
        }
        registry
            .aircraft
            .sort_unstable_by_key(|entry| entry.address);
        registry
    }
}

/// Takes each aircraft as it is read, so that the file is never held as a whole map.
impl<'de> Visitor<'de> for &mut Registry {
    type Value = ();

    fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
        formatter.write_str("aircraft by address")
    }

    fn visit_map<A: MapAccess<'de>>(self, mut aircraft: A) -> Result<(), A::Error> {
        while let Some((address, fields)) = aircraft.next_entry::<String, Vec<String>>()? {
            self.push(&address, &fields);
        }
        Ok(())
    }
}

/// Where Mictronics publishes the database, which it renews every week.
pub const DATABASE: &str =
    "https://github.com/Mictronics/aircraft-database/raw/refs/heads/main/indexedDB.zip";

/// Mictronics renews the database every week.
const REFRESH_EVERY: Duration = Duration::from_hours(7 * 24);
const RETRY_AFTER: Duration = Duration::from_hours(1);
const DOWNLOAD_WITHIN: Duration = Duration::from_mins(5);

/// Keeps the registry as the database is published at `url`, for as long as
/// anyone reads the registry: starts from the copy kept in the file, and
/// downloads the database whenever that copy is a week old, missing or unreadable.
pub async fn keep_current(url: String, kept: PathBuf, registry: watch::Sender<Arc<Registry>>) {
    tokio::select! {
        () = refresh(&url, &kept, &registry) => {}
        () = registry.closed() => {}
    }
}

async fn refresh(url: &str, kept: &Path, registry: &watch::Sender<Arc<Registry>>) {
    let publish = |read: Result<Registry, Failure>| match read {
        Ok(read) => {
            eprintln!("aircraft database: {} aircraft", read.aircraft.len());
            registry.send_replace(Arc::new(read));
        }
        Err(failure) => eprintln!("aircraft database: {failure}"),
    };
    // A copy that does not read as the database is no better than none.
    let mut usable = false;
    if let Ok(zip) = std::fs::read(kept) {
        let copy = read(zip).await.map(|(read, _)| read);
        usable = copy.is_ok();
        publish(copy);
    }
    let client = client();
    loop {
        // What is left of the week of the kept copy, when it is that recent.
        let age = age(kept).filter(|_| usable);
        let left = age.and_then(|age| REFRESH_EVERY.checked_sub(age));
        let wait = if let Some(left) = left.filter(|left| !left.is_zero()) {
            left
        } else {
            let downloaded = download(&client, url, kept).await;
            usable |= downloaded.is_ok();
            let wait = downloaded.as_ref().map_or(RETRY_AFTER, |_| REFRESH_EVERY);
            publish(downloaded);
            wait
        };
        tokio::time::sleep(wait).await;
    }
}

/// A client that speaks https by the system's certificates.
fn client() -> reqwest::Client {
    // Refused only when the process has a provider already, which serves as well.
    let _ = rustls::crypto::ring::default_provider().install_default();
    reqwest::Client::new()
}

/// How long ago the copy was written; none when there is none.
fn age(kept: &Path) -> Option<Duration> {
    let written = std::fs::metadata(kept).ok()?.modified().ok()?;
    Some(written.elapsed().unwrap_or_default())
}

/// The database as published, kept in the file once it reads as one.
async fn download(client: &reqwest::Client, url: &str, kept: &Path) -> Result<Registry, Failure> {
    let answer = client.get(url).timeout(DOWNLOAD_WITHIN).send().await?;
    let zip = answer.error_for_status()?.bytes().await?;
    let (registry, zip) = read(zip.into()).await?;
    // Written aside first, so that a copy is never kept in part.
    let aside = kept.with_extension("part");
    std::fs::create_dir_all(kept.parent().ok_or("the copy has no directory")?)?;
    std::fs::write(&aside, zip)?;
    std::fs::rename(aside, kept)?;
    Ok(registry)
}

/// Reads the zip off the threads that serve, since it takes a while, and gives it back.
async fn read(zip: Vec<u8>) -> Result<(Registry, Vec<u8>), Failure> {
    let reading = tokio::task::spawn_blocking(move || Registry::read(&zip).map(|read| (read, zip)));
    reading.await?
}

/// The file of the name in the archive.
fn file(archive: &mut ZipArchive<Cursor<&[u8]>>, name: &str) -> Result<Vec<u8>, Failure> {
    let mut contents = Vec::new();
    archive.by_name(name)?.read_to_end(&mut contents)?;
    Ok(contents)
}

#[cfg(test)]
pub(crate) mod tests {
    use std::io::{Cursor, Write};
    use std::path::PathBuf;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{Duration, SystemTime};

    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use tokio::sync::watch;
    use tokio::time::timeout;
    use zip::ZipWriter;
    use zip::write::SimpleFileOptions;

    use super::{Registry, keep_current};
    use crate::proto::{self, Address, AddressType, Aircraft, Snapshot};

    /// Made-up aircraft at addresses ICAO reserves, and one real type.
    const AIRCRAFT: &str = r#"{
        "D00002": ["TEST-02", "B789", "00"],
        "d00001": ["TEST-01", "ZZZZ", "00"],
        "D00003": ["", "", "00"],
        "D00004": ["TEST\/04", "B789"],
        "nonsense": ["TEST-05", "B789", "00"]
    }"#;
    const TYPES: &str = r#"{"B789": ["BOEING 787-9 Dreamliner", "L2J", "H"]}"#;

    /// A zip of the files, each with its name.
    pub(crate) fn zipped(files: &[(&str, &str)]) -> Vec<u8> {
        let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
        for (name, contents) in files {
            zip.start_file(*name, SimpleFileOptions::default())
                .expect("starts");
            zip.write_all(contents.as_bytes()).expect("writes");
        }
        zip.finish().expect("finishes").into_inner()
    }

    pub(crate) fn database() -> Vec<u8> {
        zipped(&[("aircrafts.json", AIRCRAFT), ("types.json", TYPES)])
    }

    fn registered(registration: Option<&str>, designator: Option<&str>) -> proto::Registry {
        proto::Registry {
            registration: registration.map(str::to_owned),
            type_designator: designator.map(str::to_owned),
            type_description: designator
                .filter(|designator| *designator == "B789")
                .map(|_| "BOEING 787-9 Dreamliner".to_owned()),
        }
    }

    #[test]
    fn aircraft_is_registered_under_its_address_in_either_case() {
        // Arrange
        let registry = Registry::read(&database()).expect("reads");

        // Act
        let found =
            [0x00d0_0001, 0x00d0_0002, 0x00d0_0004].map(|address| registry.registered(address));

        // Assert: a type the database does not describe, one it does, and an escaped registration
        let expected = [
            registered(Some("TEST-01"), Some("ZZZZ")),
            registered(Some("TEST-02"), Some("B789")),
            registered(Some("TEST/04"), Some("B789")),
        ];
        assert_eq!(found, expected.map(Some));
    }

    #[test]
    fn address_without_a_registration_or_a_type_is_not_registered() {
        // Arrange: one the database does not have, and one it has nothing under
        let registry = Registry::read(&database()).expect("reads");

        // Act
        let found = [0x00d0_0009, 0x00d0_0003].map(|address| registry.registered(address));

        // Assert
        assert_eq!(found, [None, None]);
    }

    #[test]
    fn what_is_not_the_database_is_refused() {
        // Arrange: no zip, a zip without the types, and one whose aircraft are no JSON
        let files = [
            b"not a zip".to_vec(),
            zipped(&[("aircrafts.json", AIRCRAFT)]),
            zipped(&[("aircrafts.json", "not json"), ("types.json", TYPES)]),
        ];

        // Act
        let read = files.map(|zip| Registry::read(&zip).is_err());

        // Assert
        assert_eq!(read, [true; 3]);
    }

    #[test]
    fn aircraft_with_an_icao_address_are_given_what_is_registered() {
        // Arrange: the same number as an ICAO address and as another
        let registry = Registry::read(&database()).expect("reads");
        let at = |r#type: AddressType| Aircraft {
            address: Some(Address {
                value: 0x00d0_0002,
                r#type: r#type.into(),
            }),
            ..Aircraft::default()
        };
        let mut snapshot = Snapshot {
            aircraft: vec![at(AddressType::Icao), at(AddressType::NonIcao)],
            ..Snapshot::default()
        };

        // Act
        registry.fill(&mut snapshot);

        // Assert
        let filled: Vec<_> = snapshot.aircraft.into_iter().map(|a| a.registry).collect();
        assert_eq!(
            filled,
            [Some(registered(Some("TEST-02"), Some("B789"))), None]
        );
    }

    #[test]
    fn registry_can_be_gathered_from_aircraft_known_otherwise() {
        // Arrange: out of the order of their addresses
        let aircraft = [
            (0x00d0_0002, "TEST-02".to_owned(), "A320".to_owned()),
            (0x00d0_0001, "TEST-01".to_owned(), "B789".to_owned()),
        ];

        // Act
        let registry: Registry = aircraft.into_iter().collect();

        // Assert
        let found = [0x00d0_0001, 0x00d0_0002].map(|address| registry.registered(address));
        let expected =
            [("TEST-01", "B789"), ("TEST-02", "A320")].map(|(registration, designator)| {
                Some(proto::Registry {
                    registration: Some(registration.into()),
                    type_designator: Some(designator.into()),
                    type_description: None,
                })
            });
        assert_eq!(found, expected);
    }

    #[test]
    fn empty_registry_knows_no_aircraft() {
        // Arrange
        let registry = Registry::default();

        // Act
        let found = registry.registered(0x00d0_0001);

        // Assert
        assert_eq!(found, None);
    }

    /// A made-up aircraft the test database does not have, for telling a newer database apart.
    fn newer_database() -> Vec<u8> {
        let aircraft = r#"{"D00009": ["TEST-09", "B789", "00"]}"#;
        zipped(&[("aircrafts.json", aircraft), ("types.json", TYPES)])
    }

    /// A web server that answers every request with the status and the body,
    /// and counts the requests: its URL and the count.
    async fn answering(status: &'static str, body: Vec<u8>) -> (String, Arc<AtomicUsize>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("binds");
        let url = format!("http://{}/db.zip", listener.local_addr().expect("bound"));
        let asked = Arc::new(AtomicUsize::new(0));
        let count = Arc::clone(&asked);
        tokio::spawn(async move {
            while let Ok((mut stream, _)) = listener.accept().await {
                count.fetch_add(1, Ordering::SeqCst);
                let mut request = [0; 1024];
                let _ = stream.read(&mut request).await;
                let head = format!(
                    "HTTP/1.1 {status}\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
                    body.len()
                );
                let _ = stream.write_all(&[head.as_bytes(), &body].concat()).await;
            }
        });
        (url, asked)
    }

    /// A file for the database in a directory that does not exist yet, holding
    /// the contents as if written so long ago when given.
    fn kept(contents: Option<(&[u8], Duration)>) -> (tempfile::TempDir, PathBuf) {
        let directory = tempfile::tempdir().expect("a directory");
        let path = directory.path().join("papaquebec/aircraft-database.zip");
        if let Some((contents, age)) = contents {
            std::fs::create_dir_all(path.parent().expect("a parent")).expect("a directory");
            std::fs::write(&path, contents).expect("written");
            let file = std::fs::File::options()
                .write(true)
                .open(&path)
                .expect("opens");
            file.set_modified(SystemTime::now() - age).expect("dated");
        }
        (directory, path)
    }

    /// The registries published within a moment of starting to keep one current.
    async fn published(url: String, kept: PathBuf) -> Vec<Arc<Registry>> {
        let (sender, mut registry) = watch::channel(Arc::new(Registry::default()));
        tokio::spawn(keep_current(url, kept, sender));
        let mut published = Vec::new();
        while let Ok(Ok(())) = timeout(Duration::from_millis(500), registry.changed()).await {
            published.push(Arc::clone(&registry.borrow_and_update()));
        }
        published
    }

    fn knows(registry: &Registry, address: u32) -> bool {
        registry.registered(address).is_some()
    }

    const DAY: Duration = Duration::from_hours(24);

    #[tokio::test]
    async fn kept_copy_that_is_recent_is_read_without_asking_again() {
        // Arrange
        let (url, asked) = answering("200 OK", newer_database()).await;
        let (_directory, path) = kept(Some((&database(), 6 * DAY)));

        // Act
        let published = published(url, path).await;

        // Assert
        let known: Vec<_> = published.iter().map(|r| knows(r, 0x00d0_0002)).collect();
        assert_eq!(known, [true]);
        assert_eq!(asked.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn database_is_downloaded_when_none_is_kept_and_then_kept() {
        // Arrange
        let (url, _) = answering("200 OK", database()).await;
        let (_directory, path) = kept(None);

        // Act
        let published = published(url, path.clone()).await;

        // Assert
        let known: Vec<_> = published.iter().map(|r| knows(r, 0x00d0_0002)).collect();
        assert_eq!(known, [true]);
        assert_eq!(std::fs::read(path).ok(), Some(database()));
    }

    #[tokio::test]
    async fn kept_copy_a_week_old_is_read_and_then_replaced_by_the_published_one() {
        // Arrange
        let (url, asked) = answering("200 OK", newer_database()).await;
        let (_directory, path) = kept(Some((&database(), 8 * DAY)));

        // Act
        let published = published(url, path.clone()).await;

        // Assert
        let known: Vec<_> = published
            .iter()
            .map(|r| (knows(r, 0x00d0_0002), knows(r, 0x00d0_0009)))
            .collect();
        assert_eq!(known, [(true, false), (false, true)]);
        assert_eq!(std::fs::read(path).ok(), Some(newer_database()));
        assert_eq!(asked.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn kept_copy_that_does_not_read_is_replaced_at_once_however_recent() {
        // Arrange
        let (url, asked) = answering("200 OK", database()).await;
        let (_directory, path) = kept(Some((b"not the database", DAY)));

        // Act
        let published = published(url, path.clone()).await;

        // Assert
        let known: Vec<_> = published.iter().map(|r| knows(r, 0x00d0_0002)).collect();
        assert_eq!(known, [true]);
        assert_eq!(std::fs::read(path).ok(), Some(database()));
        assert_eq!(asked.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn kept_copy_stays_when_what_is_downloaded_is_not_the_database() {
        // Arrange: a server that fails, and one that answers with something else
        let servers = [
            answering("404 Not Found", Vec::new()).await,
            answering("200 OK", b"<html>sorry</html>".to_vec()).await,
        ];
        let copies = [(); 2].map(|()| kept(Some((&database(), 8 * DAY))));

        // Act
        let mut published_by_each = Vec::new();
        for ((url, _), (_, path)) in servers.iter().zip(&copies) {
            published_by_each.push(published(url.clone(), path.clone()).await.len());
        }

        // Assert
        let kept = copies.map(|(_directory, path)| std::fs::read(path).ok());
        assert_eq!(published_by_each, [1, 1]);
        assert_eq!(kept, [Some(database()), Some(database())]);
    }

    #[tokio::test]
    async fn keeping_current_ends_once_nobody_reads_the_registry() {
        // Arrange
        let (url, _) = answering("200 OK", database()).await;
        let (_directory, path) = kept(None);
        let (sender, registry) = watch::channel(Arc::new(Registry::default()));

        // Act
        drop(registry);
        let ended = timeout(Duration::from_secs(5), keep_current(url, path, sender)).await;

        // Assert
        assert_eq!(ended, Ok(()));
    }
}
