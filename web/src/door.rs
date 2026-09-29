//! The door the scope is reached through: https with a certificate for whatever
//! name or address the browser asked for, or plain http behind someone else's.

use std::collections::HashMap;
use std::io;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, Instant};

use authority::{Authority, Subject};
use axum::Router;
use feeder::Failure;
use hyper_util::rt::{TokioExecutor, TokioIo};
use hyper_util::server::conn::auto::Builder;
use hyper_util::service::TowerToHyperService;
use rustls::ServerConfig;
use rustls::server::Acceptor;
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::net::{TcpListener, TcpStream};
use tokio_rustls::LazyConfigAcceptor;

/// A third of the ninety days a certificate lasts.
const REISSUE_AFTER: Duration = Duration::from_hours(30 * 24);
/// More names than a household reaches its server by; anyone may ask for any.
const MOST_SUBJECTS: usize = 64;

/// A certificate for each subject the door was reached by, issued when first
/// asked for and again well before it ends.
pub struct Certificates {
    authority: Authority,
    /// The one subject to answer to, when the door is kept to one.
    only: Option<Subject>,
    issued: Mutex<HashMap<Subject, (Instant, Arc<ServerConfig>)>>,
}

impl Certificates {
    #[must_use]
    pub fn new(authority: Authority, only: Option<Subject>) -> Self {
        Self {
            authority,
            only,
            issued: Mutex::default(),
        }
    }

    fn config_for(&self, subject: Subject) -> Result<Arc<ServerConfig>, Failure> {
        if self.only.as_ref().is_some_and(|only| *only != subject) {
            return Err(format!("{subject:?} is not what the door is kept to").into());
        }
        let mut issued = self.issued.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some((at, config)) = issued.get(&subject)
            && at.elapsed() < REISSUE_AFTER
        {
            return Ok(Arc::clone(config));
        }
        if issued.len() >= MOST_SUBJECTS {
            issued.clear();
        }
        let config = Arc::new(self.issue(&subject)?);
        issued.insert(subject, (Instant::now(), Arc::clone(&config)));
        Ok(config)
    }

    fn issue(&self, subject: &Subject) -> Result<ServerConfig, Failure> {
        let certificate = self.authority.issue(subject)?;
        let provider = Arc::new(rustls::crypto::ring::default_provider());
        let mut config = ServerConfig::builder_with_provider(provider)
            .with_safe_default_protocol_versions()?
            .with_no_client_auth()
            .with_single_cert(certificate.chain, certificate.key)?;
        config.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];
        Ok(config)
    }
}

/// Answers every connection with `router`, over https when there are
/// certificates to issue and plainly otherwise.
///
/// # Errors
///
/// When the listener can accept no more.
pub async fn serve(
    listener: TcpListener,
    certificates: Option<Arc<Certificates>>,
    router: Router,
) -> io::Result<()> {
    loop {
        let (stream, _) = listener.accept().await?;
        let (certificates, router) = (certificates.clone(), router.clone());
        tokio::spawn(async move {
            let answered = match certificates {
                Some(certificates) => secure(stream, &certificates, router).await,
                None => answer(stream, router).await,
            };
            // A browser that does not trust the authority yet ends up here, as does a scan.
            if let Err(failure) = answered {
                eprintln!("door: {failure}");
            }
        });
    }
}

/// A browser names the host it opened, unless that is an address; then the
/// address the connection reached is what it opened.
async fn secure(
    stream: TcpStream,
    certificates: &Certificates,
    router: Router,
) -> Result<(), Failure> {
    let reached = stream.local_addr()?.ip().to_canonical();
    let hello = LazyConfigAcceptor::new(Acceptor::default(), stream).await?;
    let subject = match hello.client_hello().server_name() {
        Some(name) => Subject::Name(name.to_ascii_lowercase()),
        None => Subject::Address(reached),
    };
    let config = certificates.config_for(subject)?;
    answer(hello.into_stream(config).await?, router).await
}

async fn answer<S>(stream: S, router: Router) -> Result<(), Failure>
where
    S: AsyncRead + AsyncWrite + Unpin + Send + 'static,
{
    let service = TowerToHyperService::new(router);
    let connection = Builder::new(TokioExecutor::new());
    connection
        .serve_connection(TokioIo::new(stream), service)
        .await
}

#[cfg(test)]
mod tests {
    use std::net::SocketAddr;
    use std::sync::Arc;

    use authority::{Authority, Subject};
    use axum::Router;
    use axum::routing::get;
    use rustls::pki_types::{CertificateDer, ServerName};
    use rustls::{ClientConfig, RootCertStore};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::{TcpListener, TcpStream};
    use tokio_rustls::TlsConnector;

    use super::{Certificates, serve};

    fn page() -> Router {
        Router::new().route("/", get(|| async { "the scope" }))
    }

    /// A door on a free port, and the authority a client has to trust.
    async fn door(only: Option<Subject>) -> (SocketAddr, CertificateDer<'static>) {
        let authority = Authority::create().expect("an authority").0;
        let trusted = authority.certificate().clone();
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("binds");
        let address = listener.local_addr().expect("bound");
        let certificates = Some(Arc::new(Certificates::new(authority, only)));
        tokio::spawn(serve(listener, certificates, page()));
        (address, trusted)
    }

    struct Answered {
        certificate: CertificateDer<'static>,
        protocol: Option<Vec<u8>>,
        response: String,
    }

    /// Asks for the page as a browser that trusts only `trusted` and opened `host`.
    async fn ask(
        address: SocketAddr,
        trusted: &CertificateDer<'static>,
        host: &str,
        protocols: &[&[u8]],
    ) -> Option<Answered> {
        let mut roots = RootCertStore::empty();
        roots.add(trusted.clone()).ok()?;
        let provider = Arc::new(rustls::crypto::ring::default_provider());
        let mut config = ClientConfig::builder_with_provider(provider)
            .with_safe_default_protocol_versions()
            .ok()?
            .with_root_certificates(roots)
            .with_no_client_auth();
        config.alpn_protocols = protocols.iter().map(|protocol| protocol.to_vec()).collect();
        let host = ServerName::try_from(host.to_owned()).ok()?;
        let stream = TcpStream::connect(address).await.ok()?;
        let mut stream = TlsConnector::from(Arc::new(config))
            .connect(host, stream)
            .await
            .ok()?;
        let (_, session) = stream.get_ref();
        let certificate = session.peer_certificates()?.first()?.clone().into_owned();
        let protocol = session.alpn_protocol().map(<[u8]>::to_vec);
        let mut response = String::new();
        if protocol.as_deref() != Some(b"h2") {
            let request = b"GET / HTTP/1.1\r\nhost: scope\r\nconnection: close\r\n\r\n";
            stream.write_all(request).await.ok()?;
            stream.read_to_string(&mut response).await.ok()?;
        }
        Some(Answered {
            certificate,
            protocol,
            response,
        })
    }

    #[tokio::test]
    async fn page_is_served_under_the_name_asked_for() {
        // Arrange
        let (address, trusted) = door(None).await;

        // Act
        let answered = ask(address, &trusted, "raspberrypi.local", &[]).await;

        // Assert
        let response = answered.expect("answers").response;
        assert!(response.starts_with("HTTP/1.1 200"), "{response}");
        assert!(response.ends_with("the scope"), "{response}");
    }

    #[tokio::test]
    async fn page_is_served_under_the_address_reached() {
        // Arrange
        let (address, trusted) = door(None).await;

        // Act
        let answered = ask(address, &trusted, "127.0.0.1", &[]).await;

        // Assert
        let response = answered.expect("answers").response;
        assert!(response.ends_with("the scope"), "{response}");
    }

    #[tokio::test]
    async fn certificate_is_issued_once_for_a_name() {
        // Arrange
        let (address, trusted) = door(None).await;
        let first = ask(address, &trusted, "raspberrypi.local", &[])
            .await
            .expect("answers");

        // Act
        let again = ask(address, &trusted, "raspberrypi.local", &[]).await;

        // Assert
        assert_eq!(again.expect("answers").certificate, first.certificate);
    }

    #[tokio::test]
    async fn only_the_name_the_door_is_kept_to_is_served() {
        // Arrange
        let kept_to = Subject::Name("raspberrypi.local".into());
        let (address, trusted) = door(Some(kept_to)).await;

        // Act
        let answered = [
            ask(address, &trusted, "raspberrypi.local", &[]).await,
            ask(address, &trusted, "example.com", &[]).await,
            ask(address, &trusted, "127.0.0.1", &[]).await,
        ];

        // Assert
        assert_eq!(
            answered.map(|answered| answered.is_some()),
            [true, false, false]
        );
    }

    #[tokio::test]
    async fn newer_protocol_is_spoken_when_the_browser_offers_it() {
        // Arrange
        let (address, trusted) = door(None).await;

        // Act
        let answered = ask(
            address,
            &trusted,
            "raspberrypi.local",
            &[b"h2", b"http/1.1"],
        )
        .await;

        // Assert
        assert_eq!(
            answered.expect("answers").protocol.as_deref(),
            Some(b"h2".as_slice())
        );
    }

    #[tokio::test]
    async fn page_is_served_plainly_without_an_authority() {
        // Arrange
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("binds");
        let address = listener.local_addr().expect("bound");
        tokio::spawn(serve(listener, None, page()));
        let mut stream = TcpStream::connect(address).await.expect("connects");
        let request = b"GET / HTTP/1.1\r\nhost: scope\r\nconnection: close\r\n\r\n";
        stream.write_all(request).await.expect("asks");

        // Act
        let mut response = String::new();
        let read = stream.read_to_string(&mut response).await;

        // Assert
        assert!(read.is_ok());
        assert!(response.ends_with("the scope"), "{response}");
    }
}
