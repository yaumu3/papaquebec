//! What the tests of the server's modules share.

use std::sync::{Arc, Mutex, PoisonError};

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

/// The requests a test server has answered, by their target.
#[derive(Clone, Default)]
pub(crate) struct Asked(Arc<Mutex<Vec<String>>>);

impl Asked {
    pub(crate) fn count(&self) -> usize {
        self.targets().len()
    }

    /// Each request's target, in order: the path and query the client asked for.
    pub(crate) fn targets(&self) -> Vec<String> {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    fn note(&self, request: &[u8]) {
        let line = String::from_utf8_lossy(request);
        let target = line.split(' ').nth(1).unwrap_or("").to_owned();
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(target);
    }
}

/// A web server that answers every request with the status and the body, and
/// notes what it is asked: its URL, at `path`, and the requests.
pub(crate) async fn answering(
    path: &str,
    status: &'static str,
    body: &'static [u8],
) -> (String, Asked) {
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("binds");
    let url = format!("http://{}{path}", listener.local_addr().expect("bound"));
    let asked = Asked::default();
    let noting = asked.clone();
    tokio::spawn(async move {
        while let Ok((mut stream, _)) = listener.accept().await {
            let mut request = [0; 1024];
            let read = stream.read(&mut request).await.unwrap_or(0);
            noting.note(&request[..read]);
            let head = format!(
                "HTTP/1.1 {status}\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
                body.len()
            );
            let _ = stream.write_all(&[head.as_bytes(), body].concat()).await;
        }
    });
    (url, asked)
}
