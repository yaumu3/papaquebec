//! Places data blocks: the cost of every bearing a block could take, annealed over.

mod anneal;
pub use anneal::BATCH;
pub mod codec;
pub mod cost;
pub mod geometry;
pub mod greedy;
pub mod hyper;
pub mod placement;
mod relations;
pub mod rng;
pub mod score;
#[cfg(target_arch = "wasm32")]
mod wasm;
