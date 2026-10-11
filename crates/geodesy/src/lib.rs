//! Geodesics on the WGS-84 ellipsoid by Vincenty's formulae (T. Vincenty,
//! "Direct and inverse solutions of geodesics on the ellipsoid with application
//! of nested equations", Survey Review XXIII/176, 1975): sub-millimetre at a
//! receiver's ranges. The inverse fails to converge only for nearly antipodal
//! places, which nothing here measures.

/// The semi-axes of the WGS-84 ellipsoid, m, and its flattening.
const A_M: f64 = 6_378_137.0;
const F: f64 = 1.0 / 298.257_223_563;
const B_M: f64 = A_M * (1.0 - F);
const METRES_IN_NM: f64 = 1852.0;
const MAX_ITERATIONS: usize = 100;
const CONVERGED: f64 = 1e-12;

/// How far one place lies from another along the geodesic, and the true
/// course that leaves the first for it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Leg {
    pub distance_nm: f64,
    /// Degrees from true north, 0 up to 360.
    pub bearing_deg: f64,
}

/// The leg from one place to another, each as its latitude and longitude in degrees.
#[must_use]
pub fn inverse(from: (f64, f64), to: (f64, f64)) -> Leg {
    let lon_diff = (to.1 - from.1).to_radians();
    let (sin_u1, cos_u1) = reduced(from.0).sin_cos();
    let (sin_u2, cos_u2) = reduced(to.0).sin_cos();
    let mut lambda = lon_diff;
    let (mut sin_l, mut cos_l) = (0.0, 1.0);
    let (mut sin_s, mut cos_s, mut sigma) = (0.0, 1.0, 0.0);
    let (mut cos2_alpha, mut cos2_sm) = (1.0, 0.0);
    for _ in 0..MAX_ITERATIONS {
        (sin_l, cos_l) = lambda.sin_cos();
        sin_s = (cos_u2 * sin_l).hypot(cos_u1 * sin_u2 - sin_u1 * cos_u2 * cos_l);
        if sin_s == 0.0 {
            return Leg {
                distance_nm: 0.0,
                bearing_deg: 0.0,
            };
        }
        cos_s = sin_u1 * sin_u2 + cos_u1 * cos_u2 * cos_l;
        sigma = sin_s.atan2(cos_s);
        let sin_alpha = cos_u1 * cos_u2 * sin_l / sin_s;
        cos2_alpha = 1.0 - sin_alpha * sin_alpha;
        cos2_sm = if cos2_alpha == 0.0 {
            0.0
        } else {
            cos_s - 2.0 * sin_u1 * sin_u2 / cos2_alpha
        };
        let before = lambda;
        lambda =
            lon_diff + longitude_correction(sin_alpha, cos2_alpha, sigma, sin_s, cos_s, cos2_sm);
        if (lambda - before).abs() < CONVERGED {
            break;
        }
    }
    let (series_a, series_b) = series(cos2_alpha);
    let distance_m = B_M * series_a * (sigma - delta_sigma(series_b, sin_s, cos_s, cos2_sm));
    let course = (cos_u2 * sin_l).atan2(cos_u1 * sin_u2 - sin_u1 * cos_u2 * cos_l);
    Leg {
        distance_nm: distance_m / METRES_IN_NM,
        bearing_deg: course.to_degrees().rem_euclid(360.0),
    }
}

/// The place the leg leads to from `from`, as its latitude and longitude in degrees.
#[must_use]
pub fn direct(from: (f64, f64), leg: Leg) -> (f64, f64) {
    let distance_m = leg.distance_nm * METRES_IN_NM;
    let (sin_course, cos_course) = leg.bearing_deg.to_radians().sin_cos();
    let tan_u1 = (1.0 - F) * from.0.to_radians().tan();
    let cos_u1 = 1.0 / (1.0 + tan_u1 * tan_u1).sqrt();
    let sin_u1 = tan_u1 * cos_u1;
    let sigma1 = tan_u1.atan2(cos_course);
    let sin_alpha = cos_u1 * sin_course;
    let cos2_alpha = 1.0 - sin_alpha * sin_alpha;
    let (series_a, series_b) = series(cos2_alpha);
    let mut sigma = distance_m / (B_M * series_a);
    for _ in 0..MAX_ITERATIONS {
        let cos2_sm = (2.0 * sigma1 + sigma).cos();
        let (sin_s, cos_s) = sigma.sin_cos();
        let before = sigma;
        sigma = distance_m / (B_M * series_a) + delta_sigma(series_b, sin_s, cos_s, cos2_sm);
        if (sigma - before).abs() < CONVERGED {
            break;
        }
    }
    let (sin_s, cos_s) = sigma.sin_cos();
    let cos2_sm = (2.0 * sigma1 + sigma).cos();
    let across = sin_u1 * sin_s - cos_u1 * cos_s * cos_course;
    let lat =
        (sin_u1 * cos_s + cos_u1 * sin_s * cos_course).atan2((1.0 - F) * sin_alpha.hypot(across));
    let lambda = (sin_s * sin_course).atan2(cos_u1 * cos_s - sin_u1 * sin_s * cos_course);
    let lon_diff =
        lambda - longitude_correction(sin_alpha, cos2_alpha, sigma, sin_s, cos_s, cos2_sm);
    (lat.to_degrees(), from.1 + lon_diff.to_degrees())
}

/// The reduced latitude of a geodetic one in degrees: its latitude on the auxiliary sphere.
fn reduced(lat_deg: f64) -> f64 {
    ((1.0 - F) * lat_deg.to_radians().tan()).atan()
}

/// Vincenty's A and B series in u², shared by the inverse and the direct solution.
fn series(cos2_alpha: f64) -> (f64, f64) {
    let u2 = cos2_alpha * (A_M * A_M - B_M * B_M) / (B_M * B_M);
    (
        1.0 + u2 / 16384.0 * (4096.0 + u2 * (-768.0 + u2 * (320.0 - 175.0 * u2))),
        u2 / 1024.0 * (256.0 + u2 * (-128.0 + u2 * (74.0 - 47.0 * u2))),
    )
}

/// Δσ, the correction from the sphere's arc to the ellipsoid's.
fn delta_sigma(b: f64, sin_s: f64, cos_s: f64, cos2_sm: f64) -> f64 {
    let c2 = cos2_sm * cos2_sm;
    b * sin_s
        * (cos2_sm
            + b / 4.0
                * (cos_s * (-1.0 + 2.0 * c2)
                    - b / 6.0 * cos2_sm * (-3.0 + 4.0 * sin_s * sin_s) * (-3.0 + 4.0 * c2)))
}

/// How much the ellipsoid's difference in longitude exceeds the auxiliary
/// sphere's over the arc σ.
fn longitude_correction(
    sin_alpha: f64,
    cos2_alpha: f64,
    sigma: f64,
    sin_s: f64,
    cos_s: f64,
    cos2_sm: f64,
) -> f64 {
    let c = F / 16.0 * cos2_alpha * (4.0 + F * (4.0 - 3.0 * cos2_alpha));
    (1.0 - c)
        * F
        * sin_alpha
        * (sigma + c * sin_s * (cos2_sm + c * cos_s * (-1.0 + 2.0 * cos2_sm * cos2_sm)))
}

#[cfg(test)]
mod tests {
    use super::{Leg, direct, inverse};

    const METRES_IN_NM: f64 = 1852.0;

    fn dms(degrees: f64, minutes: f64, seconds: f64) -> f64 {
        degrees.signum() * (degrees.abs() + minutes / 60.0 + seconds / 3600.0)
    }

    /// Vincenty's worked example, as Geoscience Australia states it.
    fn flinders_peak() -> (f64, f64) {
        (dms(-37.0, 57.0, 3.7203), dms(144.0, 25.0, 29.5244))
    }

    fn buninyong() -> (f64, f64) {
        (dms(-37.0, 39.0, 10.1561), dms(143.0, 55.0, 35.3839))
    }

    fn example() -> Leg {
        Leg {
            distance_nm: 54_972.271 / METRES_IN_NM,
            bearing_deg: dms(306.0, 52.0, 5.37),
        }
    }

    #[test]
    fn inverse_reproduces_vincentys_example_to_the_millimetre_and_the_hundredth_of_a_second() {
        // Arrange
        let (from, to) = (flinders_peak(), buninyong());

        // Act
        let leg = inverse(from, to);

        // Assert
        let expected = example();
        let off_m = (leg.distance_nm - expected.distance_nm).abs() * METRES_IN_NM;
        let off_arcsec = (leg.bearing_deg - expected.bearing_deg).abs() * 3600.0;
        assert!(off_m < 0.001 && off_arcsec < 0.01, "{leg:?}");
    }

    #[test]
    fn inverse_heads_along_a_meridian_and_measures_nothing_from_a_place_to_itself() {
        // Arrange: north, south, and the place itself
        let from = (35.0, 140.0);
        let to = [(36.0, 140.0), (34.0, 140.0), from];

        // Act
        let legs = to.map(|to| inverse(from, to));

        // Assert
        let near = |found: f64, expected: f64| (found - expected).abs() < 1e-9;
        let bearings = legs.map(|leg| leg.bearing_deg);
        let headed = bearings.into_iter().zip([0.0, 180.0, 0.0]);
        assert!(
            headed
                .into_iter()
                .all(|(found, expected)| near(found, expected)),
            "{legs:?}"
        );
        assert!(near(legs[2].distance_nm, 0.0), "{legs:?}");
        assert!(
            (legs[0].distance_nm - legs[1].distance_nm).abs() < 0.5,
            "{legs:?}"
        );
    }

    #[test]
    fn direct_lands_where_vincentys_example_does() {
        // Arrange
        let leg = example();

        // Act
        let (lat_deg, lon_deg) = direct(flinders_peak(), leg);

        // Assert
        let (lat_off, lon_off) = (lat_deg - buninyong().0, lon_deg - buninyong().1);
        assert!(lat_off.abs() * 3600.0 < 0.0001, "{lat_deg}");
        assert!(lon_off.abs() * 3600.0 < 0.0001, "{lon_deg}");
    }

    #[test]
    fn direct_comes_back_through_the_inverse_on_the_same_leg() {
        // Arrange
        let from = (35.5, 139.8);
        let legs = [(0.0, 200.0), (90.0, 200.0), (225.0, 37.5), (313.0, 400.0)].map(
            |(bearing_deg, distance_nm)| Leg {
                distance_nm,
                bearing_deg,
            },
        );

        // Act
        let back = legs.map(|leg| inverse(from, direct(from, leg)));

        // Assert
        for (back, leg) in back.iter().zip(legs) {
            assert!(
                (back.distance_nm - leg.distance_nm).abs() < 1e-6,
                "{back:?}"
            );
            assert!(
                (back.bearing_deg - leg.bearing_deg).abs() < 1e-6,
                "{back:?}"
            );
        }
    }
}
