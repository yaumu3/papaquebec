//! The geodesics as the scope calls them.

use wasm_bindgen::prelude::*;

/// The distance in NM and the initial true course in degrees from one place to another.
#[wasm_bindgen]
#[must_use]
pub fn inverse(lat_deg: f64, lon_deg: f64, to_lat_deg: f64, to_lon_deg: f64) -> Vec<f64> {
    let leg = crate::inverse((lat_deg, lon_deg), (to_lat_deg, to_lon_deg));
    vec![leg.distance_nm, leg.bearing_deg]
}

/// The latitude and longitude in degrees `distance_nm` along the geodesic
/// that leaves a place on the true course `bearing_deg`.
#[wasm_bindgen]
#[must_use]
pub fn direct(lat_deg: f64, lon_deg: f64, bearing_deg: f64, distance_nm: f64) -> Vec<f64> {
    let leg = crate::Leg {
        distance_nm,
        bearing_deg,
    };
    let (lat_deg, lon_deg) = crate::direct((lat_deg, lon_deg), leg);
    vec![lat_deg, lon_deg]
}
