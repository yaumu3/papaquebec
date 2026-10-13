//! METARs as the Aviation Weather Center publishes them: which stations issue
//! them, and the QNH each reports.

pub mod qnh;
pub mod stations;

/// What went wrong, for the log.
pub type Failure = Box<dyn std::error::Error + Send + Sync>;
