//! Follows a Beast source: hears its messages as they come, and publishes
//! what they add up to.

use std::io;
use std::sync::Arc;
use std::time::Duration;

use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::sync::watch;
use tokio::time::{Instant, MissedTickBehavior, interval_at};

use crate::Failure;
use crate::beast::{Frame, Reader};
use crate::feed::{History, Published};
use crate::message;
use crate::position::Position;
use crate::proto::Receiver;
use crate::registry::Registry;
use crate::traffic::Traffic;

/// readsb and dump1090 send a heartbeat after a minute of nothing else, so a
/// source silent for longer than two of them is no longer there.
const SILENT_FOR: Duration = Duration::from_secs(150);
const RETRY_AFTER: Duration = Duration::from_secs(1);

/// Hears the source that `connect` reaches, connecting again whenever it is
/// lost, and publishes every `every` the aircraft heard of, as they are known
/// at what `clock` gives as the seconds since the epoch. Nothing is published
/// while the source is away. Ends once nobody listens to the feed.
pub async fn follow<S, F>(
    connect: impl FnMut() -> F,
    site: Position,
    clock: impl Fn() -> f64,
    every: Duration,
    registry: watch::Receiver<Arc<Registry>>,
    feed: watch::Sender<Option<Published>>,
) where
    S: AsyncRead + Unpin,
    F: Future<Output = io::Result<S>>,
{
    let mut following = Following {
        traffic: Traffic::new(site),
        history: History::default(),
        receiver: Receiver {
            lat_deg: Some(site.lat_deg),
            lon_deg: Some(site.lon_deg),
        },
        clock,
        every,
        registry,
        feed: &feed,
    };
    tokio::select! {
        () = following.keep_hearing(connect) => {}
        () = feed.closed() => {}
    }
}

/// What is kept while a source is followed, across its connections.
struct Following<'a, C> {
    traffic: Traffic,
    history: History,
    receiver: Receiver,
    clock: C,
    every: Duration,
    registry: watch::Receiver<Arc<Registry>>,
    feed: &'a watch::Sender<Option<Published>>,
}

impl<C: Fn() -> f64> Following<'_, C> {
    /// Hears one connection after another, and logs each loss and return once.
    async fn keep_hearing<S, F>(&mut self, mut connect: impl FnMut() -> F)
    where
        S: AsyncRead + Unpin,
        F: Future<Output = io::Result<S>>,
    {
        let mut heard = true;
        loop {
            let lost = match connect().await {
                Ok(source) => {
                    if !heard {
                        eprintln!("beast: heard again");
                    }
                    heard = true;
                    self.hear(source).await
                }
                Err(failure) => failure.into(),
            };
            if heard {
                eprintln!("beast: {lost}");
            }
            heard = false;
            tokio::time::sleep(RETRY_AFTER).await;
        }
    }

    /// Hears the source until it is lost, publishing every tick, and says how it was lost.
    async fn hear(&mut self, mut source: impl AsyncRead + Unpin) -> Failure {
        let mut frames = Reader::default();
        let mut bytes = [0; 4096];
        let mut tick = interval_at(Instant::now() + self.every, self.every);
        tick.set_missed_tick_behavior(MissedTickBehavior::Delay);
        let mut heard = Instant::now();
        loop {
            tokio::select! {
                read = source.read(&mut bytes) => match read {
                    Ok(0) => return "the source closed the connection".into(),
                    Ok(read) => {
                        heard = Instant::now();
                        self.take(&frames.read(&bytes[..read]));
                    }
                    Err(failure) => return failure.into(),
                },
                _ = tick.tick() => {
                    if heard.elapsed() >= SILENT_FOR {
                        return "the source says nothing".into();
                    }
                    self.publish();
                }
            }
        }
    }

    fn take(&mut self, frames: &[Frame]) {
        let now_s = (self.clock)();
        for observation in frames.iter().filter_map(message::read) {
            self.traffic.hear(&observation, now_s);
        }
    }

    fn publish(&mut self) {
        let mut snapshot = self.traffic.snapshot((self.clock)());
        self.registry.borrow().fill(&mut snapshot);
        self.history.record(&snapshot);
        let published = Published::new(self.receiver, self.history.shared(), snapshot);
        self.feed.send_replace(Some(published));
    }
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;
    use std::io;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    use prost::Message;
    use tokio::io::{AsyncWriteExt, DuplexStream, duplex};
    use tokio::sync::watch;
    use tokio::time::Instant;

    use super::follow;
    use crate::beast::Frame as Heard;
    use crate::feed::Published;
    use crate::field::{Field, Identification};
    use crate::message::squitter;
    use crate::position::Position;
    use crate::proto::{EmitterCategory, Frame, Hello, Receiver, Snapshot, frame::Body};
    use crate::registry::Registry;
    use crate::registry::tests::database;

    /// RJFF
    const SITE: Position = Position {
        lat_deg: 33.5844,
        lon_deg: 130.4517,
    };
    /// Made up: from a block ICAO reserves for future use, and in the test database.
    const ADDRESS: u32 = 0x00d0_0002;
    const EVERY: Duration = Duration::from_secs(1);

    /// A source followed from 1000 s on: each connection made is the next of
    /// those scripted, and none comes once they are used up.
    struct Followed {
        feed: watch::Receiver<Option<Published>>,
        connected: Arc<Mutex<u32>>,
    }

    fn followed(connections: Vec<io::Result<DuplexStream>>, registry: Registry) -> Followed {
        let (sender, feed) = watch::channel(None);
        let (_, registry) = watch::channel(Arc::new(registry));
        let connected = Arc::new(Mutex::new(0));
        let (count, started) = (Arc::clone(&connected), Instant::now());
        let mut connections = VecDeque::from(connections);
        tokio::spawn(async move {
            let connect = || {
                *count.lock().expect("count") += 1;
                let next = connections.pop_front();
                async {
                    match next {
                        Some(connection) => connection,
                        None => std::future::pending().await,
                    }
                }
            };
            let clock = move || 1000.0 + started.elapsed().as_secs_f64();
            follow(connect, SITE, clock, EVERY, registry, sender).await;
        });
        Followed { feed, connected }
    }

    impl Followed {
        /// What is published within the time, each as its hello from the start and its snapshot.
        async fn published(&mut self, within: Duration) -> Vec<(Hello, Snapshot)> {
            let until = Instant::now() + within;
            let mut published = Vec::new();
            while let Ok(Ok(())) = tokio::time::timeout_at(until, self.feed.changed()).await {
                published.extend(self.feed.borrow_and_update().as_ref().map(carried));
            }
            published
        }

        fn connections(&self) -> u32 {
            *self.connected.lock().expect("count")
        }
    }

    fn carried(published: &Published) -> (Hello, Snapshot) {
        let body = |bytes| Frame::decode_length_delimited(bytes).ok()?.body;
        match (
            body(published.hello(f64::NEG_INFINITY)),
            body(published.latest().clone()),
        ) {
            (Some(Body::Hello(hello)), Some(Body::Snapshot(snapshot))) => (hello, snapshot),
            other => panic!("not a hello and a snapshot: {other:?}"),
        }
    }

    /// A message from the made-up aircraft, as a source sends it.
    fn message() -> Vec<u8> {
        let identification = Identification {
            identification: Some("TEST02".into()),
            emitter_category: EmitterCategory::A3Large,
        };
        let message = squitter(ADDRESS, identification.write());
        Heard::new(0, 128, &message).expect("a message").write()
    }

    fn instants(published: &[(Hello, Snapshot)]) -> Vec<f64> {
        published
            .iter()
            .map(|(_, snapshot)| snapshot.now_s)
            .collect()
    }

    #[tokio::test(start_paused = true)]
    async fn what_is_heard_is_published_every_tick_from_the_site() {
        // Arrange
        let (mut source, connection) = duplex(1024);
        let mut followed = followed(vec![Ok(connection)], Registry::default());
        source
            .write_all(&[message(), message()].concat())
            .await
            .expect("sends");

        // Act
        let published = followed.published(Duration::from_millis(2500)).await;

        // Assert
        assert_eq!(instants(&published), [1001.0, 1002.0]);
        let (hello, snapshot) = &published[1];
        let receiver = Receiver {
            lat_deg: Some(SITE.lat_deg),
            lon_deg: Some(SITE.lon_deg),
        };
        assert_eq!(hello.receiver, Some(receiver));
        let known: Vec<_> = snapshot
            .aircraft
            .iter()
            .map(|a| a.identification.as_deref())
            .collect();
        assert_eq!(known, [Some("TEST02")]);
        assert_eq!(snapshot.messages, 2);
    }

    #[tokio::test(start_paused = true)]
    async fn message_cut_between_two_reads_is_heard() {
        // Arrange
        let (mut source, connection) = duplex(1024);
        let mut followed = followed(vec![Ok(connection)], Registry::default());
        let bytes = [message(), message()].concat();
        source.write_all(&bytes[..30]).await.expect("sends");
        tokio::time::sleep(Duration::from_millis(100)).await;
        source.write_all(&bytes[30..]).await.expect("sends");

        // Act
        let published = followed.published(Duration::from_millis(1500)).await;

        // Assert
        let messages: Vec<_> = published
            .iter()
            .map(|(_, snapshot)| snapshot.messages)
            .collect();
        assert_eq!(messages, [2]);
    }

    #[tokio::test(start_paused = true)]
    async fn aircraft_are_published_with_what_is_registered() {
        // Arrange
        let (mut source, connection) = duplex(1024);
        let registry = Registry::read(&database()).expect("reads");
        let mut followed = followed(vec![Ok(connection)], registry);
        source
            .write_all(&[message(), message()].concat())
            .await
            .expect("sends");

        // Act
        let published = followed.published(Duration::from_millis(1500)).await;

        // Assert
        let registrations: Vec<_> = published
            .iter()
            .flat_map(|(_, snapshot)| &snapshot.aircraft)
            .map(|a| a.registry.as_ref()?.registration.as_deref())
            .collect();
        assert_eq!(registrations, [Some("TEST-02")]);
    }

    #[tokio::test(start_paused = true)]
    async fn history_is_kept_from_what_was_published() {
        // Arrange
        let (_source, connection) = duplex(1024);
        let mut followed = followed(vec![Ok(connection)], Registry::default());

        // Act
        let published = followed.published(Duration::from_millis(18_500)).await;

        // Assert: one snapshot every eight seconds, short of the latest
        let (hello, _) = published.last().expect("published");
        let kept: Vec<_> = hello
            .history
            .iter()
            .map(|snapshot| snapshot.now_s)
            .collect();
        assert_eq!(kept, [1001.0, 1009.0, 1017.0]);
    }

    #[tokio::test(start_paused = true)]
    async fn nothing_is_published_while_the_source_is_away() {
        // Arrange: a source that closes after two seconds and a half, cannot
        // be reached at first, and then comes back
        let (source, connection) = duplex(1024);
        let (_back, again) = duplex(1024);
        let refused = io::Error::from(io::ErrorKind::ConnectionRefused);
        let mut followed = followed(
            vec![Ok(connection), Err(refused), Ok(again)],
            Registry::default(),
        );
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(2500)).await;
            drop(source);
        });

        // Act
        let published = followed.published(Duration::from_millis(6200)).await;

        // Assert: it is tried again every second, and ticks again from when it is back
        assert_eq!(instants(&published), [1001.0, 1002.0, 1005.5]);
        assert_eq!(followed.connections(), 3);
    }

    #[tokio::test(start_paused = true)]
    async fn source_that_says_nothing_for_long_is_connected_to_again() {
        // Arrange: a source sends at least a heartbeat every minute
        let (_silent, connection) = duplex(1024);
        let (_back, again) = duplex(1024);
        let mut followed = followed(vec![Ok(connection), Ok(again)], Registry::default());

        // Act
        let published = followed.published(Duration::from_millis(154_500)).await;

        // Assert: given up on at 150 s in place of a snapshot, and back a second later
        let instants = instants(&published);
        assert_eq!(followed.connections(), 2);
        assert_eq!(instants.len(), 149 + 3);
        assert_eq!(instants[148..], [1149.0, 1152.0, 1153.0, 1154.0]);
    }

    #[tokio::test(start_paused = true)]
    async fn following_ends_once_nobody_listens() {
        // Arrange
        let (_source, connection) = duplex(1024);
        let (sender, feed) = watch::channel(None);
        let (_, registry) = watch::channel(Arc::new(Registry::default()));
        let mut connections = Some(connection);
        let following = follow(
            || std::future::ready(connections.take().ok_or(io::ErrorKind::NotFound.into())),
            SITE,
            || 1000.0,
            EVERY,
            registry,
            sender,
        );

        // Act
        drop(feed);
        let ended = tokio::time::timeout(Duration::from_secs(5), following).await;

        // Assert
        assert_eq!(ended, Ok(()));
    }
}
