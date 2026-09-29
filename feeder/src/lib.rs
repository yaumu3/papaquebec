//! Feeds the scope with aircraft data over WebTransport.

pub mod config;
pub mod feed;
pub mod proto;
pub mod readsb;
pub mod transport;
pub mod upstream;

/// What went wrong, for the log.
pub type Failure = Box<dyn std::error::Error + Send + Sync>;
