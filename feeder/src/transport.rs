//! The WebTransport endpoint the scope connects to.
//!
//! Browsers accept its self-signed certificate by hash, provided it is ECDSA
//! and valid for no more than two weeks, so the hash is published for the
//! scope to read and the certificate is renewed well within that time.

use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::watch;
use wtransport::endpoint::IncomingSession;
use wtransport::endpoint::endpoint_side;
use wtransport::tls::Sha256DigestFmt;
use wtransport::{Endpoint, Identity, ServerConfig};

use crate::Failure;
use crate::feed::Published;

#[derive(Clone)]
pub struct Server {
    endpoint: Arc<Endpoint<endpoint_side::Server>>,
    info: PathBuf,
}

impl Server {
    /// Listens on `port`, or on a free one for 0, and publishes how to connect at `info`.
    ///
    /// # Errors
    ///
    /// When the port cannot be bound or `info` cannot be written.
    pub fn bind(port: u16, info: PathBuf) -> io::Result<Self> {
        let identity = identity()?;
        let hash = hash(&identity);
        let server = Self {
            endpoint: Arc::new(Endpoint::server(config(port, identity))?),
            info,
        };
        server.announce(&hash)?;
        Ok(server)
    }

    /// The port bound.
    ///
    /// # Panics
    ///
    /// When the socket has lost its address, which a bound one does not.
    #[must_use]
    pub fn port(&self) -> u16 {
        let address = self.endpoint.local_addr().expect("a bound socket");
        address.port()
    }

    /// Replaces the certificate; sessions already open carry on.
    ///
    /// # Errors
    ///
    /// When `info` cannot be written.
    pub fn renew(&self) -> io::Result<()> {
        let identity = identity()?;
        let hash = hash(&identity);
        self.endpoint
            .reload_config(config(self.port(), identity), false)?;
        self.announce(&hash)
    }

    /// Greets every session once the feed has started, with the history after the
    /// `since` it asks for, sends it the latest snapshot, then each one published,
    /// all on one stream so they arrive in order.
    pub async fn serve(self, feed: watch::Receiver<Option<Published>>) {
        loop {
            let incoming = self.endpoint.accept().await;
            let feed = feed.clone();
            tokio::spawn(async move {
                if let Err(failure) = session(incoming, feed).await {
                    eprintln!("session: {failure}");
                }
            });
        }
    }

    /// Written beside and moved into place, so a reader never sees half of it.
    fn announce(&self, hash: &str) -> io::Result<()> {
        let info = serde_json::json!({ "port": self.port(), "certificateHash": hash });
        let beside = self.info.with_extension("tmp");
        std::fs::create_dir_all(self.info.parent().unwrap_or(Path::new(".")))?;
        std::fs::write(&beside, info.to_string())?;
        std::fs::rename(beside, &self.info)
    }
}

fn identity() -> io::Result<Identity> {
    Identity::self_signed(["localhost"]).map_err(io::Error::other)
}

/// SHA-256 of the certificate, in hex.
fn hash(identity: &Identity) -> String {
    let certificate = &identity.certificate_chain().as_slice()[0];
    let dotted = certificate.hash().fmt(Sha256DigestFmt::DottedHex);
    dotted.replace(':', "")
}

fn config(port: u16, identity: Identity) -> ServerConfig {
    ServerConfig::builder()
        .with_bind_default(port)
        .with_identity(identity)
        .keep_alive_interval(Some(Duration::from_secs(3)))
        .build()
}

/// The `since` a session asks to resume after, in Unix seconds, when it names one.
fn since(path: &str) -> Option<f64> {
    let query = path.split_once('?').map_or("", |(_, query)| query);
    let value = query
        .split('&')
        .find_map(|pair| pair.strip_prefix("since="));
    value.and_then(|since| since.parse().ok())
}

async fn session(
    incoming: IncomingSession,
    mut feed: watch::Receiver<Option<Published>>,
) -> Result<(), Failure> {
    let request = incoming.await?;
    // A session that names no `since` gets the whole history.
    let since = since(request.path()).unwrap_or(f64::NEG_INFINITY);
    let connection = request.accept().await?;
    let mut stream = connection.open_uni().await?.await?;
    let started = tokio::select! {
        started = feed.wait_for(Option::is_some) => started?.clone(),
        _ = connection.closed() => return Ok(()),
    };
    let Some(published) = started else {
        return Ok(());
    };
    stream.write_all(&published.hello(since)).await?;
    stream.write_all(published.latest()).await?;
    loop {
        tokio::select! {
            changed = feed.changed() => changed?,
            _ = connection.closed() => return Ok(()),
        }
        let latest = feed
            .borrow_and_update()
            .as_ref()
            .map(|p| p.latest().clone());
        if let Some(latest) = latest {
            stream.write_all(&latest).await?;
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::time::Duration;

    use prost::Message;
    use tokio::sync::watch;
    use wtransport::tls::Sha256Digest;
    use wtransport::{ClientConfig, Connection, Endpoint, RecvStream};

    use super::{Server, since};
    use crate::feed::Published;
    use crate::proto::{Frame, Hello, Receiver, Snapshot, frame::Body};

    const RECEIVER: Receiver = Receiver {
        lat_deg: Some(33.5844),
        lon_deg: Some(130.4517),
    }; // RJFF

    type Feed = watch::Sender<Option<Published>>;

    fn snapshot_at(now_s: f64) -> Snapshot {
        Snapshot {
            now_s,
            ..Snapshot::default()
        }
    }

    /// Published at `now_s`, with history eight and sixteen seconds before.
    fn at(now_s: f64) -> Published {
        let history = [now_s - 16.0, now_s - 8.0].map(snapshot_at);
        Published::new(RECEIVER, history.into(), snapshot_at(now_s))
    }

    fn hello() -> Body {
        hello_after(f64::NEG_INFINITY)
    }

    fn hello_after(since: f64) -> Body {
        let history = [-16.0, -8.0].map(|before| snapshot_at(10.0 + before));
        let after = history
            .into_iter()
            .filter(|snapshot| snapshot.now_s > since);
        Body::Hello(Hello {
            receiver: Some(RECEIVER),
            history: after.collect(),
        })
    }

    fn snapshot(now_s: f64) -> Body {
        Body::Snapshot(Snapshot {
            now_s,
            ..Snapshot::default()
        })
    }

    /// A server bound to a free port.
    struct Started {
        server: Server,
        info: PathBuf,
        _directory: tempfile::TempDir,
    }

    fn started(feed: &Feed) -> Started {
        let directory = tempfile::tempdir().expect("directory");
        let info = directory.path().join("feed/info.json");
        let server = Server::bind(0, info.clone()).expect("binds");
        tokio::spawn(server.clone().serve(feed.subscribe()));
        Started {
            server,
            info,
            _directory: directory,
        }
    }

    impl Started {
        fn info(&self) -> serde_json::Value {
            serde_json::from_slice(&std::fs::read(&self.info).expect("written")).expect("json")
        }

        fn hash(&self) -> String {
            self.info()["certificateHash"]
                .as_str()
                .expect("hash")
                .to_owned()
        }

        /// Connects as the scope does: trusting only the hash.
        async fn connect(&self, hash: &str) -> Option<Connection> {
            self.connect_to(hash, "/feed").await
        }

        async fn connect_to(&self, hash: &str, path: &str) -> Option<Connection> {
            let config = ClientConfig::builder()
                .with_bind_default()
                .with_server_certificate_hashes([digest(hash)])
                .build();
            let url = format!("https://localhost:{}{path}", self.server.port());
            let endpoint = Endpoint::client(config).ok()?;
            let connecting = endpoint.connect(url);
            tokio::time::timeout(Duration::from_secs(5), connecting)
                .await
                .ok()?
                .ok()
        }
    }

    fn digest(hex: &str) -> Sha256Digest {
        let bytes: Vec<u8> = (0..hex.len())
            .step_by(2)
            .map(|at| u8::from_str_radix(&hex[at..at + 2], 16).expect("hex"))
            .collect();
        Sha256Digest::new(bytes.try_into().expect("32 bytes"))
    }

    /// The session's one stream, unless none opens in time.
    async fn stream_of(connection: &Connection) -> Option<RecvStream> {
        let accepted = tokio::time::timeout(Duration::from_secs(5), connection.accept_uni());
        accepted.await.ok()?.ok()
    }

    /// What the next frame on the stream carries, read after its length, unless it
    /// does not come in time.
    async fn next(stream: &mut RecvStream) -> Option<Body> {
        let read = async {
            let mut length = 0;
            for shift in (0..).step_by(7) {
                let mut byte = [0];
                stream.read_exact(&mut byte).await.ok()?;
                length |= usize::from(byte[0] & 0x7f) << shift;
                if byte[0] & 0x80 == 0 {
                    break;
                }
            }
            let mut frame = vec![0; length];
            stream.read_exact(&mut frame).await.ok()?;
            Frame::decode(frame.as_slice()).ok()?.body
        };
        tokio::time::timeout(Duration::from_secs(5), read)
            .await
            .ok()?
    }

    #[tokio::test]
    async fn info_names_the_port_and_the_certificate() {
        // Arrange
        let (feed, _) = watch::channel(None);
        let started = started(&feed);

        // Act
        let info = started.info();

        // Assert
        assert_eq!(info["port"], started.server.port());
        assert_eq!(info["certificateHash"].as_str().map(str::len), Some(64));
    }

    #[tokio::test]
    async fn published_certificate_is_accepted() {
        // Arrange
        let (feed, _) = watch::channel(None);
        let started = started(&feed);

        // Act
        let connection = started.connect(&started.hash()).await;

        // Assert
        assert!(connection.is_some());
    }

    #[tokio::test]
    async fn another_certificate_is_refused() {
        // Arrange
        let (feed, _) = watch::channel(None);
        let started = started(&feed);

        // Act
        let connection = started.connect(&"00".repeat(32)).await;

        // Assert
        assert!(connection.is_none());
    }

    #[tokio::test]
    async fn newcomer_is_greeted_then_given_the_latest_snapshot() {
        // Arrange
        let (feed, _) = watch::channel(Some(at(10.0)));
        let started = started(&feed);
        let connection = started.connect(&started.hash()).await.expect("connects");
        let mut stream = stream_of(&connection).await.expect("opens");

        // Act
        let frames = [next(&mut stream).await, next(&mut stream).await];

        // Assert
        assert_eq!(frames, [Some(hello()), Some(snapshot(10.0))]);
    }

    #[tokio::test]
    async fn nothing_is_sent_before_the_feed_starts() {
        // Arrange
        let (feed, _) = watch::channel(None);
        let started = started(&feed);
        let connection = started.connect(&started.hash()).await.expect("connects");
        feed.send_replace(Some(at(10.0)));
        let mut stream = stream_of(&connection).await.expect("opens");

        // Act
        let frame = next(&mut stream).await;

        // Assert
        assert_eq!(frame, Some(hello()));
    }

    #[tokio::test]
    async fn snapshots_follow_one_another_on_one_stream() {
        // Arrange
        let (feed, _) = watch::channel(Some(at(10.0)));
        let started = started(&feed);
        let connection = started.connect(&started.hash()).await.expect("connects");
        let mut stream = stream_of(&connection).await.expect("opens");
        let caught_up = [next(&mut stream).await, next(&mut stream).await];
        assert_eq!(
            caught_up,
            [Some(hello()), Some(snapshot(10.0))],
            "precondition"
        );
        feed.send_replace(Some(at(11.0)));

        // Act
        let frame = next(&mut stream).await;

        // Assert
        assert_eq!(frame, Some(snapshot(11.0)));
    }

    #[tokio::test]
    async fn renewal_publishes_another_certificate() {
        // Arrange
        let (feed, _) = watch::channel(None);
        let started = started(&feed);
        let old = started.hash();

        // Act
        let renewed = started.server.renew();

        // Assert
        assert!(renewed.is_ok());
        assert_ne!(started.hash(), old);
    }

    #[tokio::test]
    async fn renewed_certificate_is_accepted() {
        // Arrange
        let (feed, _) = watch::channel(None);
        let started = started(&feed);
        started.server.renew().expect("renews");

        // Act
        let connection = started.connect(&started.hash()).await;

        // Assert
        assert!(connection.is_some());
    }

    #[tokio::test]
    async fn replaced_certificate_is_refused() {
        // Arrange
        let (feed, _) = watch::channel(None);
        let started = started(&feed);
        let old = started.hash();
        started.server.renew().expect("renews");

        // Act
        let connection = started.connect(&old).await;

        // Assert
        assert!(connection.is_none());
    }

    #[tokio::test]
    async fn open_session_outlives_a_renewal() {
        // Arrange
        let (feed, _) = watch::channel(None);
        let started = started(&feed);
        let connection = started.connect(&started.hash()).await.expect("connects");
        let mut stream = stream_of(&connection).await.expect("opens");
        started.server.renew().expect("renews");
        feed.send_replace(Some(at(10.0)));

        // Act
        let frames = [next(&mut stream).await, next(&mut stream).await];

        // Assert
        assert_eq!(frames, [Some(hello()), Some(snapshot(10.0))]);
    }

    #[tokio::test]
    async fn session_resumes_after_the_since_it_asks_for() {
        // Arrange
        let (feed, _) = watch::channel(Some(at(10.0)));
        let started = started(&feed);
        let path = "/feed?since=-4.5";
        let connection = started
            .connect_to(&started.hash(), path)
            .await
            .expect("connects");
        let mut stream = stream_of(&connection).await.expect("opens");

        // Act
        let frame = next(&mut stream).await;

        // Assert
        assert_eq!(frame, Some(hello_after(-4.5)));
    }

    #[test]
    fn since_is_read_from_the_query() {
        // Arrange
        let paths = [
            "/feed?since=12.5",
            "/feed?x=1&since=3",
            "/feed",
            "/feed?since=soon",
        ];

        // Act
        let read = paths.map(since);

        // Assert
        assert_eq!(read, [Some(12.5), Some(3.0), None, None]);
    }
}
