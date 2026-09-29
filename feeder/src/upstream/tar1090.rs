//! A tar1090, asked over HTTP for readsb's `receiver.json` and `aircraft.json`,
//! and for its own history.

mod chunks;

use std::time::Duration;

use bytes::Bytes;

use super::Upstream;
use crate::Failure;
use crate::proto::{Receiver, Snapshot};
use crate::readsb::{parse_receiver, parse_snapshot};

/// For what is asked for once, at the start: a first lookup of a `.local` name can be slow.
const ONCE: Duration = Duration::from_secs(10);
/// For what is asked for several times a second: a late answer is better replaced.
const EVERY_TIME: Duration = Duration::from_secs(2);

pub struct Tar1090 {
    client: reqwest::Client,
    base: String,
}

impl Tar1090 {
    #[must_use]
    pub fn new(base: &str) -> Self {
        Self {
            client: reqwest::Client::new(),
            base: base.trim_end_matches('/').to_owned(),
        }
    }

    async fn get(&self, path: &str, patience: Duration) -> Result<Bytes, Failure> {
        let url = format!("{}/{path}", self.base);
        let request = self.client.get(url).timeout(patience);
        Ok(request.send().await?.error_for_status()?.bytes().await?)
    }
}

impl Upstream for Tar1090 {
    /// Its chunk files; one that cannot be read is left out.
    async fn history(&mut self) -> Result<Vec<Snapshot>, Failure> {
        let files = chunks::parse_index(&self.get("chunks/chunks.json", ONCE).await?);
        let mut history = Vec::new();
        for file in files {
            let chunk = self.get(&format!("chunks/{file}"), ONCE).await;
            match chunk.and_then(|chunk| chunks::parse_chunk(&chunk)) {
                Ok(snapshots) => history.extend(snapshots),
                Err(failure) => eprintln!("history: {file}: {failure}"),
            }
        }
        history.sort_by(|a, b| a.now_s.total_cmp(&b.now_s));
        Ok(history)
    }

    async fn receiver(&mut self) -> Result<Receiver, Failure> {
        Ok(parse_receiver(
            &self.get("data/receiver.json", ONCE).await?,
        )?)
    }

    async fn snapshot(&mut self) -> Result<Snapshot, Failure> {
        Ok(parse_snapshot(
            &self.get("data/aircraft.json", EVERY_TIME).await?,
        )?)
    }
}

#[cfg(test)]
mod tests {
    use super::chunks::tests::gzip;
    use super::{Tar1090, Upstream};
    use crate::proto::Receiver;

    /// Answers each path with its document, and anything else with 404.
    async fn serve(routes: &'static [(&'static str, &'static [u8])]) -> String {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("binds");
        let base = format!("http://{}", listener.local_addr().expect("bound"));
        tokio::spawn(async move {
            while let Ok((mut stream, _)) = listener.accept().await {
                let mut request = [0; 1024];
                let read = stream.read(&mut request).await.unwrap_or(0);
                let line = String::from_utf8_lossy(&request[..read]);
                let path = line
                    .split_whitespace()
                    .nth(1)
                    .unwrap_or_default()
                    .to_owned();
                let found = routes.iter().find(|(route, _)| *route == path);
                let (status, body) =
                    found.map_or(("404 Not Found", &b""[..]), |(_, body)| ("200 OK", body));
                let head = format!(
                    "HTTP/1.1 {status}\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
                    body.len()
                );
                let _ = stream.write_all(head.as_bytes()).await;
                let _ = stream.write_all(body).await;
            }
        });
        base
    }

    #[tokio::test]
    async fn answers_with_its_aircraft_json() {
        // Arrange
        const AIRCRAFT: &[u8] = br#"{"now":10,"messages":0,"aircraft":[{"hex":"d00001"}]}"#;
        let base = serve(&[("/data/aircraft.json", AIRCRAFT)]).await;
        let mut tar1090 = Tar1090::new(&base);

        // Act
        let snapshot = tar1090.snapshot().await;

        // Assert
        let snapshot = snapshot.expect("answers");
        assert!((snapshot.now_s - 10.0).abs() < f64::EPSILON);
        assert_eq!(snapshot.aircraft.len(), 1);
    }

    #[tokio::test]
    async fn fails_on_an_unreadable_document() {
        // Arrange
        let base = serve(&[("/data/aircraft.json", b"not json")]).await;
        let mut tar1090 = Tar1090::new(&base);

        // Act
        let snapshot = tar1090.snapshot().await;

        // Assert
        assert!(snapshot.is_err());
    }

    #[tokio::test]
    async fn answers_with_its_receiver_json() {
        // Arrange
        const RECEIVER: &[u8] = br#"{"lat":33.5844,"lon":130.4517}"#; // RJFF
        let base = serve(&[("/data/receiver.json", RECEIVER)]).await;
        let mut tar1090 = Tar1090::new(&base);

        // Act
        let answered = tar1090.receiver().await;

        // Assert
        let expected = Receiver {
            lat_deg: Some(33.5844),
            lon_deg: Some(130.4517),
        };
        assert_eq!(answered.ok(), Some(expected));
    }

    #[tokio::test]
    async fn fails_when_the_receiver_is_missing() {
        // Arrange
        let base = serve(&[]).await;
        let mut tar1090 = Tar1090::new(&base);

        // Act
        let answered = tar1090.receiver().await;

        // Assert
        assert!(answered.is_err());
    }

    #[tokio::test]
    async fn history_comes_from_its_chunks_in_time_order() {
        // Arrange
        let chunk = |json: &str| -> &'static [u8] { Box::leak(gzip(json).into_boxed_slice()) };
        let routes = vec![
            (
                "/chunks/chunks.json",
                &br#"{"chunks":["chunk_2.gz","broken.gz","chunk_1.gz"]}"#[..],
            ),
            (
                "/chunks/chunk_1.gz",
                chunk(r#"{"files":[{"now":8,"aircraft":[]},{"now":24,"aircraft":[]}]}"#),
            ),
            (
                "/chunks/chunk_2.gz",
                chunk(r#"{"files":[{"now":16,"aircraft":[]}]}"#),
            ),
            ("/chunks/broken.gz", b"not gzip"),
        ];
        let base = serve(routes.leak()).await;
        let mut tar1090 = Tar1090::new(&base);

        // Act
        let history = tar1090.history().await;

        // Assert
        let instants: Vec<f64> = history.expect("answers").iter().map(|s| s.now_s).collect();
        assert_eq!(instants, [8.0, 16.0, 24.0]);
    }

    #[tokio::test]
    async fn history_fails_without_its_index() {
        // Arrange
        let base = serve(&[]).await;
        let mut tar1090 = Tar1090::new(&base);

        // Act
        let history = tar1090.history().await;

        // Assert
        assert!(history.is_err());
    }
}
