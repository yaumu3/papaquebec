//! Feeds the scope with aircraft data over WebTransport.

pub mod air;
pub mod beast;
pub mod bits;
pub mod cpr;
pub mod feed;
pub mod field;
pub mod follow;
pub mod message;
pub mod position;
pub mod proto;
pub mod register;
pub mod registry;
pub mod traffic;
pub mod transport;
pub mod wmm;

/// What went wrong, for the log.
pub type Failure = Box<dyn std::error::Error + Send + Sync>;
