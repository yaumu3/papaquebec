//! The model as the scope calls it.

use wasm_bindgen::prelude::*;

/// The magnetic declination at the position in the year, degrees east.
#[wasm_bindgen(js_name = declinationDeg)]
#[must_use]
pub fn declination_deg(lat_deg: f64, lon_deg: f64, year: f64) -> f64 {
    crate::declination_deg(lat_deg, lon_deg, year)
}

/// The year at the seconds since the epoch, with the fraction of it gone.
#[wasm_bindgen(js_name = yearOf)]
#[must_use]
pub fn year_of(epoch_s: f64) -> f64 {
    crate::year_of(epoch_s)
}
