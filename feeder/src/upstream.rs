//! Where the traffic comes from.

pub mod sim;
pub mod tar1090;

use std::time::Duration;

use tokio::sync::watch;

use crate::Failure;
use crate::feed::{History, Published};
use crate::proto::{Receiver, Snapshot};

/// A source of traffic that can be asked what it knows now.
pub trait Upstream: Send {
    /// Where the receiver is.
    fn receiver(&mut self) -> impl Future<Output = Result<Receiver, Failure>> + Send;
    /// What the receiver kept of the last hour, oldest first; nothing by default.
    fn history(&mut self) -> impl Future<Output = Result<Vec<Snapshot>, Failure>> + Send {
        std::future::ready(Ok(Vec::new()))
    }
    /// Every aircraft the receiver knows now.
    fn snapshot(&mut self) -> impl Future<Output = Result<Snapshot, Failure>> + Send;
}

/// Logs an upstream that stops or starts answering, once each time.
struct Answering(bool);

impl Answering {
    fn note<T>(&mut self, result: &Result<T, Failure>) {
        match (result, self.0) {
            (Err(failure), true) => eprintln!("upstream: {failure}"),
            (Ok(_), false) => eprintln!("upstream: answers again"),
            _ => {}
        }
        self.0 = result.is_ok();
    }
}

/// Asks `upstream` where it is and what it kept, then every `every` what it hears, and publishes
/// each snapshot later than the last with the history it adds to, for as long as
/// anyone listens.
pub async fn follow(
    mut upstream: impl Upstream,
    every: Duration,
    feed: watch::Sender<Option<Published>>,
) {
    let mut answering = Answering(true);
    let mut tick = tokio::time::interval(every);
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let receiver = loop {
        tick.tick().await;
        if feed.is_closed() {
            return;
        }
        let receiver = upstream.receiver().await;
        answering.note(&receiver);
        if let Ok(receiver) = receiver {
            break receiver;
        }
    };
    let mut history = History::default();
    match upstream.history().await {
        Ok(kept) => history.seed(kept),
        Err(failure) => eprintln!("history not seeded: {failure}"),
    }
    let mut last_now_s = 0.0;
    while !feed.is_closed() {
        tick.tick().await;
        let snapshot = upstream.snapshot().await;
        answering.note(&snapshot);
        if let Some(snapshot) = snapshot.ok().filter(|snapshot| snapshot.now_s > last_now_s) {
            last_now_s = snapshot.now_s;
            history.record(&snapshot);
            feed.send_replace(Some(Published::new(receiver, history.shared(), snapshot)));
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;
    use std::time::Duration;

    use prost::Message;
    use tokio::sync::watch;

    use super::{Failure, Upstream, follow};
    use crate::feed::Published;
    use crate::proto::{Frame, Receiver, Snapshot, frame::Body};

    const RECEIVER: Receiver = Receiver {
        lat_deg: Some(33.5844),
        lon_deg: Some(130.4517),
    }; // RJFF

    /// Answers with each scripted result in turn, then never again.
    struct Scripted {
        receivers: VecDeque<Result<Receiver, Failure>>,
        history: Vec<Snapshot>,
        snapshots: VecDeque<Result<Snapshot, Failure>>,
    }

    async fn next<T>(script: &mut VecDeque<Result<T, Failure>>) -> Result<T, Failure> {
        match script.pop_front() {
            Some(result) => result,
            None => std::future::pending().await,
        }
    }

    impl Upstream for Scripted {
        async fn receiver(&mut self) -> Result<Receiver, Failure> {
            next(&mut self.receivers).await
        }

        fn history(&mut self) -> impl Future<Output = Result<Vec<Snapshot>, Failure>> + Send {
            std::future::ready(Ok(std::mem::take(&mut self.history)))
        }

        async fn snapshot(&mut self) -> Result<Snapshot, Failure> {
            next(&mut self.snapshots).await
        }
    }

    fn at(now_s: f64) -> Snapshot {
        Snapshot {
            now_s,
            ..Snapshot::default()
        }
    }

    /// Follows the scripts, answering what each publication carried, until nothing more comes.
    async fn published(
        receivers: Vec<Result<Receiver, Failure>>,
        history: Vec<Snapshot>,
        snapshots: Vec<Result<Snapshot, Failure>>,
    ) -> Vec<(Option<Receiver>, Vec<f64>, Option<f64>)> {
        let (sender, mut feed) = watch::channel(None);
        let upstream = Scripted {
            receivers: receivers.into(),
            history,
            snapshots: snapshots.into(),
        };
        tokio::spawn(follow(upstream, Duration::from_millis(250), sender));
        let mut seen = Vec::new();
        while let Ok(Ok(())) = tokio::time::timeout(Duration::from_secs(5), feed.changed()).await {
            let published: Option<Published> = feed.borrow_and_update().clone();
            seen.push(published.as_ref().map_or((None, vec![], None), carried));
        }
        seen
    }

    fn carried(published: &Published) -> (Option<Receiver>, Vec<f64>, Option<f64>) {
        let body = |bytes| {
            Frame::decode_length_delimited(bytes)
                .ok()
                .and_then(|f| f.body)
        };
        let (receiver, history) = match body(published.hello(f64::NEG_INFINITY)) {
            Some(Body::Hello(hello)) => (hello.receiver, hello.history),
            _ => (None, vec![]),
        };
        let now = match body(published.latest().clone()) {
            Some(Body::Snapshot(snapshot)) => Some(snapshot.now_s),
            _ => None,
        };
        let history = history.iter().map(|snapshot| snapshot.now_s).collect();
        (receiver, history, now)
    }

    #[tokio::test(start_paused = true)]
    async fn only_later_snapshots_are_published() {
        // Arrange
        let snapshots = vec![
            Ok(at(10.0)),
            Ok(at(10.0)),
            Err("down".into()),
            Ok(at(11.0)),
            Ok(at(9.0)),
            Ok(at(12.0)),
        ];

        // Act
        let seen = published(vec![Ok(RECEIVER)], vec![], snapshots).await;

        // Assert
        let instants: Vec<_> = seen.iter().map(|(_, _, now)| *now).collect();
        assert_eq!(instants, [Some(10.0), Some(11.0), Some(12.0)]);
    }

    #[tokio::test(start_paused = true)]
    async fn nothing_is_published_until_the_receiver_answers() {
        // Arrange
        let receivers = vec![Err("down".into()), Ok(RECEIVER)];

        // Act
        let seen = published(receivers, vec![], vec![Ok(at(10.0))]).await;

        // Assert
        assert_eq!(seen, [(Some(RECEIVER), vec![10.0], Some(10.0))]);
    }

    #[tokio::test(start_paused = true)]
    async fn history_starts_from_what_the_upstream_kept() {
        // Arrange
        let kept = vec![at(1.0), at(9.0)];

        // Act
        let seen = published(vec![Ok(RECEIVER)], kept, vec![Ok(at(20.0))]).await;

        // Assert
        assert_eq!(seen, [(Some(RECEIVER), vec![1.0, 9.0, 20.0], Some(20.0))]);
    }
}
