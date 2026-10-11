//! The aircraft database, kept current from where Mictronics publishes it.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::watch;
use tracker::registry::Registry;

use crate::Failure;

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
            eprintln!("aircraft database: {} aircraft", read.known());

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

#[cfg(test)]
mod tests {
    use std::io::{Cursor, Write};
    use std::path::PathBuf;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{Duration, SystemTime};

    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use tokio::sync::watch;
    use tokio::time::timeout;
    use tracker::registry::Registry;
    use zip::ZipWriter;
    use zip::write::SimpleFileOptions;

    use super::keep_current;

    /// The database as published, holding the aircraft and no types.
    fn zipped(aircraft: &str) -> Vec<u8> {
        let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
        for (name, contents) in [("aircrafts.json", aircraft), ("types.json", "{}")] {
            zip.start_file(name, SimpleFileOptions::default())
                .expect("starts");
            zip.write_all(contents.as_bytes()).expect("writes");
        }
        zip.finish().expect("finishes").into_inner()
    }

    /// One made-up aircraft, from a block ICAO reserves for future use.
    fn database() -> Vec<u8> {
        zipped(r#"{"D00002": ["TEST-02", "B789", "00"]}"#)
    }

    /// A made-up aircraft the test database does not have, for telling a newer database apart.
    fn newer_database() -> Vec<u8> {
        zipped(r#"{"D00009": ["TEST-09", "B789", "00"]}"#)
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
