//! Feeds the scope with aircraft data over WebTransport.

pub mod feed;
pub mod follow;
pub mod transport;

/// What went wrong, for the log.
pub type Failure = Box<dyn std::error::Error + Send + Sync>;
