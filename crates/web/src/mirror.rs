//! Files others publish, each kept current in a copy on disk and read into what
//! the server uses.

pub mod aircraft;

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::watch;

use crate::Failure;

const RETRY_AFTER: Duration = Duration::from_hours(1);
const DOWNLOAD_WITHIN: Duration = Duration::from_mins(5);

/// A file someone publishes and renews, read into what the server uses.
pub trait Publication: Sized + Send + Sync + 'static {
    /// What the log calls it.
    const NAME: &str;
    /// How old a kept copy may grow before it is downloaded again.
    const RENEW_AT: Duration;

    /// Reads the file as published.
    ///
    /// # Errors
    ///
    /// When the bytes do not read as the publication.
    fn read(published: &[u8]) -> Result<Self, Failure>;

    /// What the log says of it once read.
    fn tally(&self) -> String;
}

/// Keeps the publication as it is published at `url`, for as long as anyone
/// reads it: starts from the copy kept in the file, and downloads the
/// publication whenever that copy is too old, missing or unreadable.
pub async fn keep_current<P: Publication>(
    url: String,
    kept: PathBuf,
    sender: watch::Sender<Arc<P>>,
) {
    tokio::select! {
        () = refresh(&url, &kept, &sender) => {}
        () = sender.closed() => {}
    }
}

async fn refresh<P: Publication>(url: &str, kept: &Path, sender: &watch::Sender<Arc<P>>) {
    let publish = |read: Result<P, Failure>| match read {
        Ok(read) => {
            eprintln!("{}: {}", P::NAME, read.tally());
            sender.send_replace(Arc::new(read));
        }
        Err(failure) => eprintln!("{}: {failure}", P::NAME),
    };
    // A copy that does not read as the publication is no better than none.
    let mut usable = false;
    if let Ok(published) = std::fs::read(kept) {
        let copy = read::<P>(published).await.map(|(read, _)| read);
        usable = copy.is_ok();
        publish(copy);
    }
    let client = client();
    loop {
        // What is left before the kept copy is due for renewal, when it is that recent.
        let age = age(kept).filter(|_| usable);
        let left = age.and_then(|age| P::RENEW_AT.checked_sub(age));
        let wait = if let Some(left) = left.filter(|left| !left.is_zero()) {
            left
        } else {
            let downloaded = download::<P>(&client, url, kept).await;
            usable |= downloaded.is_ok();
            let wait = downloaded.as_ref().map_or(RETRY_AFTER, |_| P::RENEW_AT);
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

/// The publication as published, kept in the file once it reads as one.
async fn download<P: Publication>(
    client: &reqwest::Client,
    url: &str,
    kept: &Path,
) -> Result<P, Failure> {
    let answer = client.get(url).timeout(DOWNLOAD_WITHIN).send().await?;
    let published = answer.error_for_status()?.bytes().await?;
    let (read, published) = read::<P>(published.into()).await?;
    // Written aside first, so that a copy is never kept in part.
    let aside = kept.with_extension("part");
    std::fs::create_dir_all(kept.parent().ok_or("the copy has no directory")?)?;
    std::fs::write(&aside, published)?;
    std::fs::rename(aside, kept)?;
    Ok(read)
}

/// Reads the publication off the threads that serve, since it may take a while,
/// and gives the bytes back.
async fn read<P: Publication>(published: Vec<u8>) -> Result<(P, Vec<u8>), Failure> {
    let reading =
        tokio::task::spawn_blocking(move || P::read(&published).map(|read| (read, published)));
    reading.await?
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{Duration, SystemTime};

    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use tokio::sync::watch;
    use tokio::time::timeout;

    use super::{Publication, keep_current};
    use crate::Failure;

    const DAY: Duration = Duration::from_hours(24);

    fn ago(age: Duration) -> SystemTime {
        SystemTime::now() - age
    }

    /// A made-up publication: a line of text after a marker, refused without it.
    #[derive(Default)]
    struct Notice(String);

    impl Publication for Notice {
        const NAME: &str = "notice";
        const RENEW_AT: Duration = Duration::from_hours(7 * 24);

        fn read(published: &[u8]) -> Result<Self, Failure> {
            let text = std::str::from_utf8(published)?;
            let notice = text.strip_prefix("notice: ").ok_or("not a notice")?;
            Ok(Self(notice.to_owned()))
        }

        fn tally(&self) -> String {
            self.0.clone()
        }
    }

    const FIRST: &[u8] = b"notice: first";
    const NEWER: &[u8] = b"notice: newer";

    /// A web server that answers every request with the status and the body,
    /// and counts the requests: its URL and the count.
    async fn answering(status: &'static str, body: &'static [u8]) -> (String, Arc<AtomicUsize>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("binds");
        let url = format!("http://{}/notice", listener.local_addr().expect("bound"));
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
                let _ = stream.write_all(&[head.as_bytes(), body].concat()).await;
            }
        });
        (url, asked)
    }

    /// A file for the copy in a directory that does not exist yet, holding
    /// the contents as if written at the time when given.
    fn kept(contents: Option<(&[u8], SystemTime)>) -> (tempfile::TempDir, PathBuf) {
        let directory = tempfile::tempdir().expect("a directory");
        let path = directory.path().join("papaquebec/notice.txt");
        if let Some((contents, written)) = contents {
            std::fs::create_dir_all(path.parent().expect("a parent")).expect("a directory");
            std::fs::write(&path, contents).expect("written");
            let file = std::fs::File::options()
                .write(true)
                .open(&path)
                .expect("opens");
            file.set_modified(written).expect("dated");
        }
        (directory, path)
    }

    /// The notices published within a moment of starting to keep one current.
    async fn published(url: String, kept: PathBuf) -> Vec<String> {
        let (sender, mut notice) = watch::channel(Arc::new(Notice::default()));
        tokio::spawn(keep_current(url, kept, sender));
        let mut published = Vec::new();
        while let Ok(Ok(())) = timeout(Duration::from_millis(500), notice.changed()).await {
            published.push(notice.borrow_and_update().0.clone());
        }
        published
    }

    #[tokio::test]
    async fn kept_copy_that_is_recent_is_read_without_asking_again() {
        // Arrange
        let (url, asked) = answering("200 OK", NEWER).await;
        let (_directory, path) = kept(Some((FIRST, ago(6 * DAY))));

        // Act
        let published = published(url, path).await;

        // Assert
        assert_eq!(published, ["first"]);
        assert_eq!(asked.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn publication_is_downloaded_when_no_copy_is_kept_and_then_kept() {
        // Arrange
        let (url, _) = answering("200 OK", FIRST).await;
        let (_directory, path) = kept(None);

        // Act
        let published = published(url, path.clone()).await;

        // Assert
        assert_eq!(published, ["first"]);
        assert_eq!(std::fs::read(path).ok().as_deref(), Some(FIRST));
    }

    #[tokio::test]
    async fn kept_copy_due_for_renewal_is_read_and_then_replaced_by_the_published_one() {
        // Arrange
        let (url, asked) = answering("200 OK", NEWER).await;
        let (_directory, path) = kept(Some((FIRST, ago(8 * DAY))));

        // Act
        let published = published(url, path.clone()).await;

        // Assert
        assert_eq!(published, ["first", "newer"]);
        assert_eq!(std::fs::read(path).ok().as_deref(), Some(NEWER));
        assert_eq!(asked.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn kept_copy_that_does_not_read_is_replaced_at_once_however_recent() {
        // Arrange
        let (url, asked) = answering("200 OK", FIRST).await;
        let (_directory, path) = kept(Some((b"not a notice", ago(DAY))));

        // Act
        let published = published(url, path.clone()).await;

        // Assert
        assert_eq!(published, ["first"]);
        assert_eq!(std::fs::read(path).ok().as_deref(), Some(FIRST));
        assert_eq!(asked.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn kept_copy_stays_when_what_is_downloaded_is_not_the_publication() {
        // Arrange: a server that fails, and one that answers with something else
        let servers = [
            answering("404 Not Found", b"").await,
            answering("200 OK", b"<html>sorry</html>").await,
        ];
        let copies = [(); 2].map(|()| kept(Some((FIRST, ago(8 * DAY)))));
        let mut published_by_each = Vec::new();

        // Act
        for ((url, _), (_, path)) in servers.iter().zip(&copies) {
            published_by_each.push(published(url.clone(), path.clone()).await);
        }

        // Assert
        assert_eq!(published_by_each, [["first"], ["first"]]);
        assert_eq!(
            copies.map(|(_directory, path)| std::fs::read(path).ok()),
            [Some(FIRST.to_vec()), Some(FIRST.to_vec())]
        );
    }

    #[tokio::test]
    async fn keeping_current_ends_once_nobody_reads_the_publication() {
        // Arrange
        let (url, _) = answering("200 OK", FIRST).await;
        let (_directory, path) = kept(None);
        let (sender, notice) = watch::channel(Arc::new(Notice::default()));

        // Act
        drop(notice);
        let ended = timeout(Duration::from_secs(5), keep_current(url, path, sender)).await;

        // Assert
        assert_eq!(ended, Ok(()));
    }
}
