//! Places data blocks: the cost of every bearing a block could take, annealed over.

mod anneal;
pub mod codec;
pub mod cost;
pub mod geometry;
pub mod hyper;
pub mod placement;
mod relations;
pub mod rng;
#[cfg(target_arch = "wasm32")]
mod wasm;
