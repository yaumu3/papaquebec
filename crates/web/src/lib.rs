//! Serves the scope and its feed.

pub mod config;
pub mod door;
pub mod site;

/// What went wrong, for the log.
pub type Failure = Box<dyn std::error::Error + Send + Sync>;
