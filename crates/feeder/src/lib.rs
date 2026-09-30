//! Feeds the scope with aircraft data over WebTransport.

pub mod beast;
pub mod bits;
pub mod cpr;
pub mod feed;
pub mod field;
pub mod position;
pub mod proto;
pub mod readsb;
pub mod transport;
pub mod upstream;

/// What went wrong, for the log.
pub type Failure = Box<dyn std::error::Error + Send + Sync>;
