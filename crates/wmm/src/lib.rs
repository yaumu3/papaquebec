//! The World Magnetic Model: how far magnetic north lies from true north, by
//! NOAA's WMM2025.

#[cfg(target_arch = "wasm32")]
mod wasm;

/// The semi-axes of the WGS-84 ellipsoid, km.
const A_KM: f64 = 6_378.137;
const B_KM: f64 = 6_356.752_314_2;
/// The geomagnetic reference radius, km.
const REFERENCE_KM: f64 = 6_371.2;
const DEGREE: u8 = 12;
const TERMS: usize = 91;
const EPOCH: f64 = 2025.0;
/// Seconds in the mean year of the Gregorian calendar.
const YEAR_S: f64 = 31_556_952.0;

/// The Gauss coefficients of WMM2025 from NOAA's `WMM.COF` of 2024-11-13,
/// public domain: the degree n, the order m, g and h in nT, and their change
/// a year.
#[rustfmt::skip]
const COEFFICIENTS: [(u8, u8, f64, f64, f64, f64); 90] = [
    (1, 0, -29351.8, 0.0, 12.0, 0.0),
    (1, 1, -1410.8, 4545.4, 9.7, -21.5),
    (2, 0, -2556.6, 0.0, -11.6, 0.0),
    (2, 1, 2951.1, -3133.6, -5.2, -27.7),
    (2, 2, 1649.3, -815.1, -8.0, -12.1),
    (3, 0, 1361.0, 0.0, -1.3, 0.0),
    (3, 1, -2404.1, -56.6, -4.2, 4.0),
    (3, 2, 1243.8, 237.5, 0.4, -0.3),
    (3, 3, 453.6, -549.5, -15.6, -4.1),
    (4, 0, 895.0, 0.0, -1.6, 0.0),
    (4, 1, 799.5, 278.6, -2.4, -1.1),
    (4, 2, 55.7, -133.9, -6.0, 4.1),
    (4, 3, -281.1, 212.0, 5.6, 1.6),
    (4, 4, 12.1, -375.6, -7.0, -4.4),
    (5, 0, -233.2, 0.0, 0.6, 0.0),
    (5, 1, 368.9, 45.4, 1.4, -0.5),
    (5, 2, 187.2, 220.2, 0.0, 2.2),
    (5, 3, -138.7, -122.9, 0.6, 0.4),
    (5, 4, -142.0, 43.0, 2.2, 1.7),
    (5, 5, 20.9, 106.1, 0.9, 1.9),
    (6, 0, 64.4, 0.0, -0.2, 0.0),
    (6, 1, 63.8, -18.4, -0.4, 0.3),
    (6, 2, 76.9, 16.8, 0.9, -1.6),
    (6, 3, -115.7, 48.8, 1.2, -0.4),
    (6, 4, -40.9, -59.8, -0.9, 0.9),
    (6, 5, 14.9, 10.9, 0.3, 0.7),
    (6, 6, -60.7, 72.7, 0.9, 0.9),
    (7, 0, 79.5, 0.0, -0.0, 0.0),
    (7, 1, -77.0, -48.9, -0.1, 0.6),
    (7, 2, -8.8, -14.4, -0.1, 0.5),
    (7, 3, 59.3, -1.0, 0.5, -0.8),
    (7, 4, 15.8, 23.4, -0.1, 0.0),
    (7, 5, 2.5, -7.4, -0.8, -1.0),
    (7, 6, -11.1, -25.1, -0.8, 0.6),
    (7, 7, 14.2, -2.3, 0.8, -0.2),
    (8, 0, 23.2, 0.0, -0.1, 0.0),
    (8, 1, 10.8, 7.1, 0.2, -0.2),
    (8, 2, -17.5, -12.6, 0.0, 0.5),
    (8, 3, 2.0, 11.4, 0.5, -0.4),
    (8, 4, -21.7, -9.7, -0.1, 0.4),
    (8, 5, 16.9, 12.7, 0.3, -0.5),
    (8, 6, 15.0, 0.7, 0.2, -0.6),
    (8, 7, -16.8, -5.2, -0.0, 0.3),
    (8, 8, 0.9, 3.9, 0.2, 0.2),
    (9, 0, 4.6, 0.0, -0.0, 0.0),
    (9, 1, 7.8, -24.8, -0.1, -0.3),
    (9, 2, 3.0, 12.2, 0.1, 0.3),
    (9, 3, -0.2, 8.3, 0.3, -0.3),
    (9, 4, -2.5, -3.3, -0.3, 0.3),
    (9, 5, -13.1, -5.2, 0.0, 0.2),
    (9, 6, 2.4, 7.2, 0.3, -0.1),
    (9, 7, 8.6, -0.6, -0.1, -0.2),
    (9, 8, -8.7, 0.8, 0.1, 0.4),
    (9, 9, -12.9, 10.0, -0.1, 0.1),
    (10, 0, -1.3, 0.0, 0.1, 0.0),
    (10, 1, -6.4, 3.3, 0.0, 0.0),
    (10, 2, 0.2, 0.0, 0.1, -0.0),
    (10, 3, 2.0, 2.4, 0.1, -0.2),
    (10, 4, -1.0, 5.3, -0.0, 0.1),
    (10, 5, -0.6, -9.1, -0.3, -0.1),
    (10, 6, -0.9, 0.4, 0.0, 0.1),
    (10, 7, 1.5, -4.2, -0.1, 0.0),
    (10, 8, 0.9, -3.8, -0.1, -0.1),
    (10, 9, -2.7, 0.9, -0.0, 0.2),
    (10, 10, -3.9, -9.1, -0.0, -0.0),
    (11, 0, 2.9, 0.0, 0.0, 0.0),
    (11, 1, -1.5, 0.0, -0.0, -0.0),
    (11, 2, -2.5, 2.9, 0.0, 0.1),
    (11, 3, 2.4, -0.6, 0.0, -0.0),
    (11, 4, -0.6, 0.2, 0.0, 0.1),
    (11, 5, -0.1, 0.5, -0.1, -0.0),
    (11, 6, -0.6, -0.3, 0.0, -0.0),
    (11, 7, -0.1, -1.2, -0.0, 0.1),
    (11, 8, 1.1, -1.7, -0.1, -0.0),
    (11, 9, -1.0, -2.9, -0.1, 0.0),
    (11, 10, -0.2, -1.8, -0.1, 0.0),
    (11, 11, 2.6, -2.3, -0.1, 0.0),
    (12, 0, -2.0, 0.0, 0.0, 0.0),
    (12, 1, -0.2, -1.3, 0.0, -0.0),
    (12, 2, 0.3, 0.7, -0.0, 0.0),
    (12, 3, 1.2, 1.0, -0.0, -0.1),
    (12, 4, -1.3, -1.4, -0.0, 0.1),
    (12, 5, 0.6, -0.0, -0.0, -0.0),
    (12, 6, 0.6, 0.6, 0.1, -0.0),
    (12, 7, 0.5, -0.1, -0.0, -0.0),
    (12, 8, -0.1, 0.8, 0.0, 0.0),
    (12, 9, -0.4, 0.1, 0.0, -0.0),
    (12, 10, -0.2, -1.0, -0.1, -0.0),
    (12, 11, -1.3, 0.1, -0.0, 0.0),
    (12, 12, -0.7, 0.2, -0.1, -0.1),
];

/// The year at the seconds since the epoch, with the fraction of it gone: to
/// within a day, which the model's drift of a tenth of a degree a year makes
/// nothing of.
#[must_use]
pub fn year_of(epoch_s: f64) -> f64 {
    1970.0 + epoch_s / YEAR_S
}

/// The magnetic declination at the position on the ellipsoid in the year,
/// degrees east.
#[must_use]
pub fn declination_deg(lat_deg: f64, lon_deg: f64, year: f64) -> f64 {
    let lat = lat_deg.to_radians();
    let lon = lon_deg.to_radians();
    let (sin_lat, cos_lat) = lat.sin_cos();
    // The position as seen from the centre of the sphere.
    let eccentricity2 = 1.0 - (B_KM / A_KM).powi(2);
    let curvature = A_KM / (1.0 - eccentricity2 * sin_lat * sin_lat).sqrt();
    let across = curvature * cos_lat;
    let up = curvature * (1.0 - eccentricity2) * sin_lat;
    let radius = across.hypot(up);
    let lat_c = (up / radius).asin();
    let (x, cos_c) = (lat_c.sin(), lat_c.cos());
    let (p, dp) = legendre(x, cos_c);
    let since = year - EPOCH;
    let ratio = REFERENCE_KM / radius;
    let (mut north, mut east, mut down) = (0.0, 0.0, 0.0);
    for &(n, m, g0, h0, gd, hd) in &COEFFICIENTS {
        let (g, h) = (g0 + since * gd, h0 + since * hd);
        let scale = schmidt(n, m) * ratio.powi(i32::from(n) + 2);
        let (sin_m, cos_m) = (f64::from(m) * lon).sin_cos();
        let along = g * cos_m + h * sin_m;
        north -= scale * along * dp.get(n, m);
        east += scale * f64::from(m) * (g * sin_m - h * cos_m) * p.get(n, m) / cos_c;
        down -= scale * f64::from(n + 1) * along * p.get(n, m);
    }
    // Turned from the sphere's frame into the ellipsoid's.
    let tilt = lat_c - lat;
    let north = north * tilt.cos() - down * tilt.sin();
    east.atan2(north).to_degrees()
}

/// Values by degree n and order m, m at most n.
struct Triangular([f64; TERMS]);

impl Triangular {
    fn at(n: u8, m: u8) -> usize {
        usize::from(n) * usize::from(n + 1) / 2 + usize::from(m)
    }

    fn get(&self, n: u8, m: u8) -> f64 {
        self.0[Self::at(n, m)]
    }

    fn set(&mut self, n: u8, m: u8, value: f64) {
        self.0[Self::at(n, m)] = value;
    }
}

/// The associated Legendre functions at x, the sine of a latitude, and their
/// derivatives by that latitude; unnormalized.
fn legendre(x: f64, cos_lat: f64) -> (Triangular, Triangular) {
    let mut p = Triangular([0.0; TERMS]);
    let mut dp = Triangular([0.0; TERMS]);
    p.set(0, 0, 1.0);
    for m in 1..=DEGREE {
        p.set(m, m, f64::from(2 * m - 1) * cos_lat * p.get(m - 1, m - 1));
    }
    for m in 0..DEGREE {
        p.set(m + 1, m, f64::from(2 * m + 1) * x * p.get(m, m));
    }
    for n in 2..=DEGREE {
        for m in 0..=n - 2 {
            let value = (f64::from(2 * n - 1) * x * p.get(n - 1, m)
                - f64::from(n + m - 1) * p.get(n - 2, m))
                / f64::from(n - m);
            p.set(n, m, value);
        }
    }
    for n in 1..=DEGREE {
        for m in 0..=n {
            let previous = if m < n { p.get(n - 1, m) } else { 0.0 };
            let value = (f64::from(n + m) * previous - f64::from(n) * x * p.get(n, m)) / cos_lat;
            dp.set(n, m, value);
        }
    }
    (p, dp)
}

/// The Schmidt semi-normalization of degree n and order m.
fn schmidt(n: u8, m: u8) -> f64 {
    // (n - m)! over (n + m)!
    let ratio = (n - m + 1..=n + m).map(f64::from).product::<f64>().recip();
    let twice = if m == 0 { 1.0 } else { 2.0 };
    (twice * ratio).sqrt()
}

#[cfg(test)]
// Compared once rounded to the digit the reference gives.
#[allow(clippy::float_cmp)]
mod tests {
    use super::{declination_deg, year_of};

    #[test]
    fn declination_matches_the_test_values_published_with_the_model() {
        // Arrange: the rows of WMM2025_TEST_VALUES.txt at sea level, as year,
        // latitude, longitude and declination
        let rows = [
            (2025.0, 80.0, 0.0, 1.28),
            (2025.0, 0.0, 120.0, -0.16),
            (2025.0, -80.0, 240.0, 68.78),
            (2027.5, 80.0, 0.0, 2.59),
            (2027.5, 0.0, 120.0, -0.24),
            (2027.5, -80.0, 240.0, 68.49),
        ];

        // Act
        let declinations =
            rows.map(|(year, lat_deg, lon_deg, _)| declination_deg(lat_deg, lon_deg, year));

        // Assert: to the hundredth of a degree they are published to
        let hundredths = declinations.map(|declination| (declination * 100.0).round() / 100.0);
        assert_eq!(hundredths, rows.map(|row| row.3));
    }

    #[test]
    fn declination_near_tokyo_is_about_eight_degrees_west() {
        // Arrange: RJTT
        let (lat_deg, lon_deg) = (35.5533, 139.7811);

        // Act
        let declination = declination_deg(lat_deg, lon_deg, 2026.75);

        // Assert
        assert!((-9.0..-7.0).contains(&declination), "{declination}");
    }

    #[test]
    fn year_is_counted_from_the_epoch_to_within_a_day() {
        // Arrange: the first of 2026, and the first of July
        let seconds = [1_767_225_600.0, 1_782_864_000.0];

        // Act
        let years = seconds.map(year_of);

        // Assert
        let expected = [2026.0, 2026.0 + 181.0 / 365.0];
        for (year, expected) in years.into_iter().zip(expected) {
            assert!(
                (year - expected).abs() < 1.0 / 365.0,
                "{year} for {expected}"
            );
        }
    }
}
