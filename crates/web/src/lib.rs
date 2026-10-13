//! Serves the scope and its feed.

pub mod config;
pub mod door;
pub mod mirror;
pub mod site;
#[cfg(test)]
pub(crate) mod testing;
pub mod weather;

/// What went wrong, for the log.
pub type Failure = Box<dyn std::error::Error + Send + Sync>;

/// A client that speaks https by the system's certificates.
#[must_use]
pub fn client() -> reqwest::Client {
    // Refused only when the process has a provider already, which serves as well.
    let _ = rustls::crypto::ring::default_provider().install_default();
    reqwest::Client::new()
}
