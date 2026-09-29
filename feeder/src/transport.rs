//! The WebTransport endpoint the scope connects to.
//!
//! Browsers accept its self-signed certificate by hash, provided it is ECDSA
//! and valid for no more than two weeks, so the hash is told to whoever asks
//! and the certificate is renewed well within that time.

use std::io;
use std::sync::{Arc, PoisonError, RwLock};
use std::time::Duration;

use serde::Serialize;
use tokio::sync::{Semaphore, watch};
use url::Url;
use wtransport::endpoint::IncomingSession;
use wtransport::endpoint::endpoint_side;
use wtransport::tls::Sha256DigestFmt;
use wtransport::{Endpoint, Identity, ServerConfig};

use crate::Failure;
use crate::feed::Published;

/// A household's screens with room to spare: every session costs up to an hour
/// of history, and a client on the network can claim any origin.
const MAX_SESSIONS: usize = 32;

/// How the scope reaches the feed.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    pub port: u16,
    /// SHA-256 of the certificate the endpoint presents, in hex.
    pub certificate_hash: String,
}

#[derive(Clone)]
pub struct Server {
    endpoint: Arc<Endpoint<endpoint_side::Server>>,
    certificate_hash: Arc<RwLock<String>>,
    /// One permit per open session.
    sessions: Arc<Semaphore>,
}

impl Server {
    /// Listens on `port`, or on a free one for 0.
    ///
    /// # Errors
    ///
    /// When the port cannot be bound.
    pub fn bind(port: u16) -> io::Result<Self> {
        Self::bind_for(port, MAX_SESSIONS)
    }

    fn bind_for(port: u16, sessions: usize) -> io::Result<Self> {
        let identity = identity()?;
        let certificate_hash = Arc::new(RwLock::new(hash(&identity)));
        Ok(Self {
            endpoint: Arc::new(Endpoint::server(config(port, identity))?),
            certificate_hash,
            sessions: Arc::new(Semaphore::new(sessions)),
        })
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
    /// When no certificate can be made.
    pub fn renew(&self) -> io::Result<()> {
        let identity = identity()?;
        let hash = hash(&identity);
        self.endpoint
            .reload_config(config(self.port(), identity), false)?;
        let published = self.certificate_hash.write();
        *published.unwrap_or_else(PoisonError::into_inner) = hash;
        Ok(())
    }

    /// Renews the certificate every `every`, and `retry` after a renewal that failed.
    pub async fn keep_renewed(self, every: Duration, retry: Duration) {
        let mut wait = every;
        loop {
            tokio::time::sleep(wait).await;
            wait = match self.renew() {
                Ok(()) => every,
                Err(error) => {
                    eprintln!("certificate not renewed: {error}");
                    retry
                }
            };
        }
    }

    /// Greets every session, up to the limit, once the feed has started, with the history after the
    /// `since` it asks for, sends it the latest snapshot, then each one published,
    /// all on one stream so they arrive in order.
    pub async fn serve(self, feed: watch::Receiver<Option<Published>>) {
        loop {
            let incoming = self.endpoint.accept().await;
            let feed = feed.clone();
            let permit = Arc::clone(&self.sessions).try_acquire_owned();
            tokio::spawn(async move {
                let served = match permit {
                    Ok(permit) => {
                        let served = session(incoming, feed).await;
                        drop(permit);
                        served
                    }
                    Err(_) => refuse_busy(incoming).await,
                };
                if let Err(failure) = served {
                    eprintln!("session: {failure}");
                }
            });
        }
    }

    /// How to reach the endpoint now.
    #[must_use]
    pub fn info(&self) -> Info {
        let hash = self.certificate_hash.read();
        Info {
            port: self.port(),
            certificate_hash: hash.unwrap_or_else(PoisonError::into_inner).clone(),
        }
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

/// Whether a session comes from a page served by the host it was addressed to,
/// as the scope's always is. A browser names the page's origin truthfully, so a
/// page from another site cannot pass; it could otherwise read the receiver's
/// position. Hosts are compared, not ports: the page and the feed have their own.
fn same_host(origin: Option<&str>, authority: &str) -> bool {
    let host = |url: &str| Url::parse(url).ok()?.host_str().map(str::to_owned);
    let Some(origin) = origin.and_then(host) else {
        return false;
    };
    host(&format!("https://{authority}")).is_some_and(|addressed| addressed == origin)
}

async fn refuse_busy(incoming: IncomingSession) -> Result<(), Failure> {
    incoming.await?.too_many_requests().await;
    Err("refused a session: too many are open".into())
}

async fn session(
    incoming: IncomingSession,
    mut feed: watch::Receiver<Option<Published>>,
) -> Result<(), Failure> {
    let request = incoming.await?;
    if !same_host(request.origin(), request.authority()) {
        let origin = request.origin().unwrap_or("no origin").to_owned();
        request.forbidden().await;
        return Err(format!("refused a session from {origin}").into());
    }
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
    use std::time::Duration;

    use prost::Message;
    use tokio::sync::watch;
    use wtransport::endpoint::ConnectOptions;
    use wtransport::tls::Sha256Digest;
    use wtransport::{ClientConfig, Connection, Endpoint, RecvStream};

    use super::{MAX_SESSIONS, Server, same_host, since};
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
    }

    fn started(feed: &Feed) -> Started {
        started_with(feed, MAX_SESSIONS)
    }

    fn started_with(feed: &Feed, sessions: usize) -> Started {
        let server = Server::bind_for(0, sessions).expect("binds");
        tokio::spawn(server.clone().serve(feed.subscribe()));
        Started { server }
    }

    impl Started {
        fn hash(&self) -> String {
            self.server.info().certificate_hash
        }

        /// Connects as the scope does: trusting only the hash, from a page served
        /// by the same host.
        async fn connect(&self, hash: &str) -> Option<Connection> {
            self.connect_to(hash, "/feed").await
        }

        async fn connect_to(&self, hash: &str, path: &str) -> Option<Connection> {
            self.connect_from(hash, path, "https://localhost").await
        }

        async fn connect_from(&self, hash: &str, path: &str, origin: &str) -> Option<Connection> {
            let config = ClientConfig::builder()
                .with_bind_default()
                .with_server_certificate_hashes([digest(hash)])
                .build();
            let url = format!("https://localhost:{}{path}", self.server.port());
            let options = ConnectOptions::builder(url)
                .add_header("origin", origin)
                .build();
            let endpoint = Endpoint::client(config).ok()?;
            let connecting = endpoint.connect(options);
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

    #[tokio::test(start_paused = true)]
    async fn certificate_is_renewed_every_period() {
        // Arrange
        let (feed, _) = watch::channel(None);
        let started = started(&feed);
        let every = Duration::from_secs(600);
        tokio::spawn(started.server.clone().keep_renewed(every, every));
        // Half a minute past each renewal, not racing it.
        tokio::time::sleep(Duration::from_secs(30)).await;
        let mut hashes = vec![started.hash()];

        // Act
        for _ in 0..2 {
            tokio::time::sleep(every).await;
            hashes.push(started.hash());
        }

        // Assert
        assert_ne!(hashes[0], hashes[1]);
        assert_ne!(hashes[1], hashes[2]);
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

    #[tokio::test]
    async fn session_from_another_site_is_refused() {
        // Arrange
        let (feed, _) = watch::channel(None);
        let started = started(&feed);

        // Act
        let connection = started
            .connect_from(&started.hash(), "/feed", "https://example.com")
            .await;

        // Assert
        assert!(connection.is_none());
    }

    #[test]
    fn origin_must_name_the_host_the_session_was_addressed_to() {
        // Arrange
        let cases = [
            (
                Some("https://raspberrypi.local"),
                "raspberrypi.local:4433",
                true,
            ),
            (
                Some("https://raspberrypi.local:8443"),
                "raspberrypi.local:4433",
                true,
            ),
            (
                Some("https://RaspberryPi.local"),
                "raspberrypi.local:4433",
                true,
            ),
            (Some("http://localhost:5173"), "localhost:4433", true),
            (Some("https://192.168.3.10:5174"), "192.168.3.10:4433", true),
            (Some("https://[::1]:5173"), "[::1]:4433", true),
            (Some("https://example.com"), "raspberrypi.local:4433", false),
            (
                Some("https://raspberrypi.local.example.com"),
                "raspberrypi.local:4433",
                false,
            ),
            (Some("null"), "raspberrypi.local:4433", false),
            (None, "raspberrypi.local:4433", false),
        ];

        // Act
        let judged = cases.map(|(origin, authority, _)| same_host(origin, authority));

        // Assert
        assert_eq!(judged, cases.map(|(_, _, allowed)| allowed));
    }

    #[tokio::test]
    async fn session_beyond_the_limit_is_refused() {
        // Arrange
        let (feed, _) = watch::channel(None);
        let started = started_with(&feed, 1);
        let first = started.connect(&started.hash()).await;
        assert!(first.is_some(), "precondition: the first session is open");

        // Act
        let second = started.connect(&started.hash()).await;

        // Assert
        assert!(second.is_none());
    }

    #[tokio::test]
    async fn closed_session_makes_room_for_another() {
        // Arrange
        let (feed, _) = watch::channel(None);
        let started = started_with(&feed, 1);
        let first = started.connect(&started.hash()).await.expect("connects");
        first.close(0u32.into(), b"done");
        tokio::time::sleep(Duration::from_millis(200)).await;

        // Act
        let second = started.connect(&started.hash()).await;

        // Assert
        assert!(second.is_some());
    }

    #[tokio::test]
    async fn server_says_how_to_reach_it() {
        // Arrange
        let (feed, _) = watch::channel(None);
        let started = started(&feed);

        // Act
        let info = started.server.info();

        // Assert
        assert_eq!(info.port, started.server.port());
        assert!(started.connect(&info.certificate_hash).await.is_some());
    }

    #[tokio::test]
    async fn server_says_the_certificate_it_renewed_to() {
        // Arrange
        let (feed, _) = watch::channel(None);
        let started = started(&feed);
        let old = started.server.info().certificate_hash;
        started.server.renew().expect("renews");

        // Act
        let info = started.server.info();

        // Assert
        assert_ne!(info.certificate_hash, old);
        assert!(started.connect(&info.certificate_hash).await.is_some());
    }

    #[test]
    fn info_is_written_as_the_scope_reads_it() {
        // Arrange
        let info = super::Info {
            port: 4433,
            certificate_hash: "ab".repeat(32),
        };

        // Act
        let json = serde_json::to_value(&info);

        // Assert
        let expected = serde_json::json!({ "port": 4433, "certificateHash": "ab".repeat(32) });
        assert_eq!(json.ok(), Some(expected));
    }
}
