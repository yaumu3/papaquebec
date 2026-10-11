//! Compact Position Reporting: the format positions are broadcast in.

use crate::position::Position;

/// A position as one message carries it: 17 bits of each coordinate, in the
/// even or the odd format.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Cpr {
    pub odd: bool,
    pub lat: u32,
    pub lon: u32,
}

/// The steps a coordinate is counted in across its zone: 2^17.
const STEPS: f64 = 131_072.0;

fn fraction(steps: u32) -> f64 {
    f64::from(steps) / STEPS
}

/// The position of an aircraft in the air as it is broadcast, in the even or
/// the odd format.
#[must_use]
pub fn airborne(position: Position, odd: bool) -> Cpr {
    encode(position, odd, 17)
}

/// The position of an aircraft on the ground as it is broadcast: counted four
/// times as finely, of which a receiver nearby needs the same 17 bits.
#[must_use]
pub fn surface(position: Position, odd: bool) -> Cpr {
    encode(position, odd, 19)
}

/// The position counted in 2^`bits` steps across its zones, the low 17 bits of each count.
fn encode(position: Position, odd: bool, bits: u32) -> Cpr {
    let scale = f64::from(1_u32 << bits);
    let steps = |angle: f64, zone: f64| (scale * angle.rem_euclid(zone) / zone + 0.5).floor();
    let lat_zone = 360.0 / if odd { 59.0 } else { 60.0 };
    let lat = steps(position.lat_deg, lat_zone);
    // The zones of longitude are those of the latitude as it will be decoded.
    let decoded = lat_zone * (lat / scale + (position.lat_deg / lat_zone).floor());
    let lon_zones = longitude_zones(decoded) - u32::from(odd);
    let lon = steps(position.lon_deg, 360.0 / f64::from(lon_zones.max(1)));
    Cpr {
        odd,
        lat: low(lat),
        lon: low(lon),
    }
}

/// The 17 bits of a count that are sent.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn low(steps: f64) -> u32 {
    steps as u32 & 0x1ffff
}

/// Where an aircraft in the air was when it sent the later of two messages,
/// one of each format, without knowing anything else. None when the two do not
/// fit together, as when the aircraft moved too far between them.
#[must_use]
pub fn global(earlier: Cpr, later: Cpr) -> Option<Position> {
    let (even, odd) = match (earlier.odd, later.odd) {
        (false, true) => (earlier, later),
        (true, false) => (later, earlier),
        _ => return None,
    };
    // The latitude zone of 6 degrees that the even message counts in.
    let zone = (59.0 * fraction(even.lat) - 60.0 * fraction(odd.lat) + 0.5).floor();
    let southern = |lat: f64| if lat >= 270.0 { lat - 360.0 } else { lat };
    let lat_of_even = southern(360.0 / 60.0 * (zone.rem_euclid(60.0) + fraction(even.lat)));
    let lat_of_odd = southern(360.0 / 59.0 * (zone.rem_euclid(59.0) + fraction(odd.lat)));
    let zones = longitude_zones(lat_of_even);
    if lat_of_even.abs() > 90.0 || lat_of_odd.abs() > 90.0 || zones != longitude_zones(lat_of_odd) {
        return None;
    }
    let (lat_deg, lon, zones_of_later) = if later.odd {
        (lat_of_odd, fraction(odd.lon), zones - 1)
    } else {
        (lat_of_even, fraction(even.lon), zones)
    };
    let zones_of_later = f64::from(zones_of_later.max(1));
    let zone = (fraction(even.lon) * f64::from(zones - 1) - fraction(odd.lon) * f64::from(zones)
        + 0.5)
        .floor();
    let lon_deg = 360.0 / zones_of_later * (zone.rem_euclid(zones_of_later) + lon);
    Some(Position {
        lat_deg,
        lon_deg: if lon_deg >= 180.0 {
            lon_deg - 360.0
        } else {
            lon_deg
        },
    })
}

/// Where an aircraft in the air is, given a position it is within 180 NM of.
#[must_use]
pub fn airborne_near(cpr: Cpr, reference: Position) -> Option<Position> {
    near(cpr, reference, 360.0)
}

/// Where an aircraft on the ground is, given a position it is within 45 NM of.
#[must_use]
pub fn surface_near(cpr: Cpr, reference: Position) -> Option<Position> {
    near(cpr, reference, 90.0)
}

/// The position closest to the reference among those the message fits, its
/// zones dividing `span` degrees.
fn near(cpr: Cpr, reference: Position, span: f64) -> Option<Position> {
    let closest = |reference: f64, zone: f64, fraction: f64| {
        zone * ((0.5 + reference / zone - fraction).floor() + fraction)
    };
    let lat_zones = if cpr.odd { 59.0 } else { 60.0 };
    let lat_deg = closest(reference.lat_deg, span / lat_zones, fraction(cpr.lat));
    if lat_deg.abs() > 90.0 {
        return None;
    }
    let lon_zones = longitude_zones(lat_deg) - u32::from(cpr.odd);
    let lon_zone = span / f64::from(lon_zones.max(1));
    let lon_deg = closest(reference.lon_deg, lon_zone, fraction(cpr.lon));
    Some(Position {
        lat_deg,
        lon_deg: (lon_deg + 180.0).rem_euclid(360.0) - 180.0,
    })
}

/// NL: how many zones of longitude a latitude has, 59 at the equator to 1 at the poles.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn longitude_zones(lat_deg: f64) -> u32 {
    /// NZ: the zones of latitude between the equator and a pole.
    const LATITUDE_ZONES: f64 = 15.0;
    let lat = lat_deg.abs();
    if lat >= 87.0 {
        return if lat > 87.0 { 1 } else { 2 };
    }
    let a = 1.0 - (std::f64::consts::PI / (2.0 * LATITUDE_ZONES)).cos();
    let zones = std::f64::consts::TAU / (1.0 - a / lat.to_radians().cos().powi(2)).acos();
    (zones.floor() as u32).min(59)
}

#[cfg(test)]
mod tests {
    use super::{Cpr, airborne, airborne_near, global, surface, surface_near};
    use crate::position::Position;

    /// "The 1090 Megahertz Riddle", airborne position: the even and the odd message.
    const EVEN: Cpr = Cpr {
        odd: false,
        lat: 93_000,
        lon: 51_372,
    };
    const ODD: Cpr = Cpr {
        odd: true,
        lat: 74_158,
        lon: 50_194,
    };
    /// Where it decodes the even message to, over the North Sea.
    const PUBLISHED: Position = Position {
        lat_deg: 52.257_20,
        lon_deg: 3.919_37,
    };

    /// Latitudes from pole to pole and longitudes around the globe, off any round number.
    fn places() -> Vec<Position> {
        let lats = (0..25).map(|step| -89.3 + 7.43 * f64::from(step));
        let lons = (0..12).map(|step| -179.1 + 29.87 * f64::from(step));
        lats.flat_map(|lat_deg| {
            lons.clone()
                .map(move |lon_deg| Position { lat_deg, lon_deg })
        })
        .collect()
    }

    /// How far apart two positions are along the worse axis, in degrees of arc.
    fn apart(a: Position, b: Position) -> f64 {
        let lon = (a.lon_deg - b.lon_deg).rem_euclid(360.0);
        let east = lon.min(360.0 - lon) * a.lat_deg.to_radians().cos();
        (a.lat_deg - b.lat_deg).abs().max(east)
    }

    #[test]
    fn positions_are_encoded_as_published() {
        // Arrange: where the book's messages were sent from, the odd one a little
        // after the even one; and at EHAM, where its surface position decodes to
        let even = Position {
            lat_deg: 52.257_202_148_437_5,
            lon_deg: 3.919_372_558_593_75,
        };
        let odd = Position {
            lat_deg: 52.265_780_174_126_06,
            lon_deg: 3.938_912_527_901_786,
        };
        let apron = Position {
            lat_deg: 52.320_560_519_978_15,
            lon_deg: 4.735_735_212_053_584,
        };

        // Act
        let encoded = [
            airborne(even, false),
            airborne(odd, true),
            surface(apron, true),
        ];

        // Assert: the last as in 8C4841753A9A153237AEF0F275BE
        let on_the_apron = Cpr {
            odd: true,
            lat: 39_195,
            lon: 110_320,
        };
        assert_eq!(encoded, [EVEN, ODD, on_the_apron]);
    }

    #[test]
    fn global_position_is_decoded_as_published() {
        // Arrange
        let (earlier, later) = (ODD, EVEN);

        // Act
        let position = global(earlier, later);

        // Assert
        let position = position.expect("decodes");
        assert!(apart(position, PUBLISHED) < 1e-5, "{position:?}");
    }

    #[test]
    fn position_near_a_reference_is_decoded_as_published() {
        // Arrange: the reference the book decodes it against
        let reference = Position {
            lat_deg: 52.258,
            lon_deg: 3.918,
        };

        // Act
        let position = airborne_near(EVEN, reference);

        // Assert
        let position = position.expect("decodes");
        assert!(apart(position, PUBLISHED) < 1e-5, "{position:?}");
    }

    #[test]
    fn global_position_is_where_the_later_message_was_sent_from() {
        // Arrange: the odd message sent a little further on than the even one
        let pairs = places().into_iter().map(|at| {
            let further = Position {
                lat_deg: at.lat_deg + 0.01,
                lon_deg: at.lon_deg + 0.01,
            };
            (airborne(at, false), airborne(further, true), further)
        });

        // Act
        let decoded: Vec<_> = pairs
            .map(|(even, odd, further)| (global(even, odd), further))
            .collect();

        // Assert: but where the two messages fall in different zones of longitude
        let apart: Vec<_> = decoded
            .iter()
            .filter_map(|(position, further)| position.map(|position| apart(position, *further)))
            .collect();
        assert!(
            apart.len() > decoded.len() * 9 / 10,
            "{} decoded",
            apart.len()
        );
        assert!(apart.iter().all(|apart| *apart < 1e-4), "{apart:?}");
    }

    #[test]
    fn global_position_is_where_either_format_was_sent_from_later() {
        // Arrange
        let places = places();

        // Act
        let decoded: Vec<_> = places
            .iter()
            .flat_map(|at| {
                let (even, odd) = (airborne(*at, false), airborne(*at, true));
                [global(even, odd), global(odd, even)]
            })
            .collect();

        // Assert
        let sent = places.iter().flat_map(|at| [*at; 2]);
        let apart: Vec<_> = decoded
            .iter()
            .zip(sent)
            .map(|(position, at)| position.map(|position| apart(position, at)))
            .collect();
        assert!(
            apart
                .iter()
                .all(|apart| apart.is_some_and(|apart| apart < 1e-4)),
            "{apart:?}"
        );
    }

    #[test]
    fn two_messages_of_one_format_give_no_global_position() {
        // Arrange
        let (earlier, later) = (EVEN, EVEN);

        // Act
        let position = global(earlier, later);

        // Assert
        assert_eq!(position, None);
    }

    #[test]
    fn messages_from_either_side_of_a_change_of_zones_give_no_global_position() {
        // Arrange: the number of longitude zones changes near 10.47 N; over the Philippine Sea
        let south = Position {
            lat_deg: 10.46,
            lon_deg: 135.0,
        };
        let north = Position {
            lat_deg: 10.48,
            lon_deg: 135.0,
        };

        // Act
        let position = global(airborne(south, false), airborne(north, true));

        // Assert
        assert_eq!(position, None);
    }

    #[test]
    fn position_near_a_reference_is_where_it_was_sent_from() {
        // Arrange: each place seen from 100 NM to its south, where there is a south
        let places: Vec<_> = places()
            .into_iter()
            .filter(|at| at.lat_deg > -88.0)
            .collect();
        let from = |at: &Position| Position {
            lat_deg: at.lat_deg - 100.0 / 60.0,
            ..*at
        };

        // Act
        let decoded: Vec<_> = places
            .iter()
            .flat_map(|at| [false, true].map(|odd| airborne_near(airborne(*at, odd), from(at))))
            .collect();

        // Assert
        let sent = places.iter().flat_map(|at| [*at; 2]);
        let apart: Vec<_> = decoded
            .iter()
            .zip(sent)
            .map(|(position, at)| position.map(|position| apart(position, at)))
            .collect();
        assert!(
            apart
                .iter()
                .all(|apart| apart.is_some_and(|apart| apart < 1e-4)),
            "{apart:?}"
        );
    }

    #[test]
    fn surface_position_near_a_reference_is_where_it_was_sent_from() {
        // Arrange: each place seen from 20 NM to its north, where there is a north
        let places: Vec<_> = places()
            .into_iter()
            .filter(|at| at.lat_deg < 88.0)
            .collect();
        let from = |at: &Position| Position {
            lat_deg: at.lat_deg + 20.0 / 60.0,
            ..*at
        };

        // Act
        let decoded: Vec<_> = places
            .iter()
            .flat_map(|at| [false, true].map(|odd| surface_near(surface(*at, odd), from(at))))
            .collect();

        // Assert
        let sent = places.iter().flat_map(|at| [*at; 2]);
        let apart: Vec<_> = decoded
            .iter()
            .zip(sent)
            .map(|(position, at)| position.map(|position| apart(position, at)))
            .collect();
        assert!(
            apart
                .iter()
                .all(|apart| apart.is_some_and(|apart| apart < 3e-5)),
            "{apart:?}"
        );
    }
}
