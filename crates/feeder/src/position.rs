//! Places on the globe.

use std::str::FromStr;

use crate::Failure;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Position {
    pub lat_deg: f64,
    pub lon_deg: f64,
}

impl Position {
    /// The distance along the great circle to the other position.
    #[must_use]
    pub fn distance_nm(self, other: Self) -> f64 {
        /// The mean radius of the Earth.
        const RADIUS_NM: f64 = 3440.065;
        let haversine = |degrees: f64| (degrees.to_radians() / 2.0).sin().powi(2);
        let across = self.lat_deg.to_radians().cos() * other.lat_deg.to_radians().cos();
        let between = haversine(other.lat_deg - self.lat_deg)
            + across * haversine(other.lon_deg - self.lon_deg);
        2.0 * RADIUS_NM * between.sqrt().asin()
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

#[cfg(test)]
mod tests {
    use super::Position;

    /// RJFF
    const SITE: Position = Position {
        lat_deg: 33.5844,
        lon_deg: 130.4517,
    };

    #[test]
    fn distance_is_along_the_great_circle() {
        // Arrange: RJTT, from RJFF; a degree of latitude; a degree of longitude at 60 N; nowhere
        let pairs = [
            (
                SITE,
                Position {
                    lat_deg: 35.5533,
                    lon_deg: 139.7811,
                },
            ),
            (
                SITE,
                Position {
                    lat_deg: SITE.lat_deg + 1.0,
                    ..SITE
                },
            ),
            (
                Position {
                    lat_deg: 60.0,
                    lon_deg: -1.0,
                },
                Position {
                    lat_deg: 60.0,
                    lon_deg: 0.0,
                },
            ),
            (SITE, SITE),
        ];

        // Act
        let distances = pairs.map(|(from, to)| from.distance_nm(to));

        // Assert: a degree of a great circle is 60.04 NM
        let expected = [477.0, 60.04, 30.02, 0.0];
        for (distance, expected) in distances.iter().zip(expected) {
            assert!(
                (distance - expected).abs() < expected * 0.005 + 1e-9,
                "{distances:?}"
            );
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
