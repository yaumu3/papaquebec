//! Places on the globe, and vectors told apart east and north or by their bearing.

use std::str::FromStr;

use crate::Failure;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Position {
    pub lat_deg: f64,
    pub lon_deg: f64,
}

impl Position {
    /// The distance along the geodesic to the other position, on the WGS-84 ellipsoid.
    #[must_use]
    pub fn distance_nm(self, other: Self) -> f64 {
        geodesy::inverse(self.into(), other.into()).distance_nm
    }

    /// How far east of true north magnetic north lies here at `now_s`, in
    /// seconds since the epoch, by the World Magnetic Model.
    #[must_use]
    pub fn declination_deg(self, now_s: f64) -> f64 {
        wmm::declination_deg(self.lat_deg, self.lon_deg, wmm::year_of(now_s))
    }
}

/// Latitude and longitude, as the geodesics take a place.
impl From<Position> for (f64, f64) {
    fn from(position: Position) -> Self {
        (position.lat_deg, position.lon_deg)
    }
}

impl FromStr for Position {
    type Err = Failure;

    /// `lat,lon` in degrees.
    fn from_str(written: &str) -> Result<Self, Failure> {
        let (lat, lon) = written.split_once(',').ok_or("expected lat,lon")?;
        let (lat_deg, lon_deg) = (lat.trim().parse::<f64>()?, lon.trim().parse::<f64>()?);
        // Asked as "within", which NaN never is.
        if !(-90.0..=90.0).contains(&lat_deg) || !(-180.0..=180.0).contains(&lon_deg) {
            return Err("outside the globe".into());
        }
        Ok(Self { lat_deg, lon_deg })
    }
}

/// The components east and north of a length on a bearing.
#[must_use]
pub fn toward(bearing_deg: f64, length: f64) -> (f64, f64) {
    let (sin, cos) = bearing_deg.to_radians().sin_cos();
    (length * sin, length * cos)
}

/// A bearing as the angle from north, -180 up to 180.
#[must_use]
pub fn signed_bearing(bearing_deg: f64) -> f64 {
    (bearing_deg + 180.0).rem_euclid(360.0) - 180.0
}

/// The bearing and the length of the components east and north.
#[must_use]
pub fn bearing_of(east: f64, north: f64) -> (f64, f64) {
    (
        east.atan2(north).to_degrees().rem_euclid(360.0),
        east.hypot(north),
    )
}

#[cfg(test)]
mod tests {
    use super::Position;

    /// RJFF
    const SITE: Position = Position {
        lat_deg: 33.5844,
        lon_deg: 130.4517,
    };

    #[test]
    fn distance_is_along_the_ellipsoid() {
        // Arrange: a degree of latitude across the equator and up to the pole, and nowhere
        let at = |lat_deg| Position {
            lat_deg,
            lon_deg: 130.0,
        };
        let pairs = [(at(-0.5), at(0.5)), (at(89.0), at(90.0)), (SITE, SITE)];

        // Act
        let distances = pairs.map(|(from, to)| from.distance_nm(to));

        // Assert: 59.705 and 60.310 NM, where a sphere has 60.04 for both
        let expected = [59.705, 60.310, 0.0];
        for (distance, expected) in distances.iter().zip(expected) {
            assert!((distance - expected).abs() < 0.005, "{distances:?}");
        }
    }

    #[test]
    fn position_is_read_from_lat_lon() {
        // Arrange
        let written = ["33.5844,130.4517", " 33.5844 , 130.4517 ", "-90,180"]; // RJFF

        // Act
        let positions = written.map(str::parse::<Position>);

        // Assert
        let poles = Position {
            lat_deg: -90.0,
            lon_deg: 180.0,
        };
        assert_eq!(
            positions.map(Result::ok),
            [Some(SITE), Some(SITE), Some(poles)]
        );
    }

    #[test]
    fn position_that_is_nowhere_is_refused() {
        // Arrange
        let written = [
            "33.5844",
            "north,east",
            "91,130",
            "33,181",
            "NaN,130",
            "33,NaN",
            "inf,130",
            "",
        ];

        // Act
        let positions = written.map(str::parse::<Position>);

        // Assert
        assert!(positions.iter().all(Result::is_err));
    }
}
