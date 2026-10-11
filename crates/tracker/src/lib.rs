//! Reads the messages a receiver hears and keeps track of each aircraft.

pub mod air;
pub mod beast;
pub mod bits;
pub mod cpr;
pub mod field;
pub mod message;
pub mod position;
pub mod proto;
pub mod register;
pub mod registry;
pub mod traffic;

/// What went wrong, for the log.
pub type Failure = Box<dyn std::error::Error + Send + Sync>;
