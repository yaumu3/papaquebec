//! The placer as the scope's worker calls it.

use wasm_bindgen::prelude::*;

use crate::codec::decode;
use crate::cost::Scene;
use crate::hyper::HYPER;
use crate::placement::place_blocks;
use crate::rng::mulberry32;

/// The worker's clock, milliseconds: `performance.now()` where there is one, else the date.
fn now() -> f64 {
    let performance = js_sys::Reflect::get(&js_sys::global(), &"performance".into()).ok();
    performance
        .filter(|p| !p.is_undefined())
        .and_then(|p| js_sys::Reflect::get(&p, &"now".into()).ok().map(|f| (p, f)))
        .and_then(|(p, f)| f.dyn_into::<js_sys::Function>().ok().map(|f| (p, f)))
        .and_then(|(p, f)| f.call0(&p).ok())
        .and_then(|v| v.as_f64())
        .unwrap_or_else(js_sys::Date::now)
}

/// The bearing of every subject in the scene `flat` encodes, at `px_per_nm`, searched from `seed`.
#[wasm_bindgen]
#[must_use]
pub fn place(flat: &[f64], px_per_nm: f64, seed: u32) -> Vec<u8> {
    let scene = Scene {
        subjects: decode(flat),
        px_per_nm,
    };
    place_blocks(&scene, mulberry32(seed), now, &HYPER)
        .into_iter()
        .map(|d| u8::try_from(d).unwrap_or(0))
        .collect()
}
