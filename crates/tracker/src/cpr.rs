//! Compact Position Reporting: the format positions are broadcast in.

use crate::position::{Position, signed_bearing};

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
pub(crate) fn global(earlier: Cpr, later: Cpr) -> Option<Position> {
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
pub(crate) fn airborne_near(cpr: Cpr, reference: Position) -> Option<Position> {
    near(cpr, reference, 360.0)
}

/// Where an aircraft on the ground is, given a position it is within 45 NM of.
#[must_use]
pub(crate) fn surface_near(cpr: Cpr, reference: Position) -> Option<Position> {
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
        lon_deg: signed_bearing(lon_deg),
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
    use super::{Cpr, airborne, airborne_near, global, longitude_zones, surface, surface_near};
    use crate::position::Position;
    use proptest::prelude::*;

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

    /// Anywhere but the last tenth of a degree before a pole, where no message
    /// can tell the longitude.
    fn place() -> impl Strategy<Value = Position> {
        (-89.9..89.9, -180.0..180.0).prop_map(|(lat_deg, lon_deg)| Position { lat_deg, lon_deg })
    }

    /// A place whose latitude has as many zones of longitude as those 0.03 degrees either side.
    fn place_within_one_count_of_zones() -> impl Strategy<Value = Position> {
        place().prop_filter("at a change of zones", |at| {
            longitude_zones(at.lat_deg - 0.03) == longitude_zones(at.lat_deg + 0.03)
        })
    }

    /// Where a place is seen from: so far north and east of it in degrees of
    /// arc, its longitude written any of three ways round the globe.
    fn offset(most_deg: f64) -> impl Strategy<Value = (f64, f64, f64)> {
        let turns = prop_oneof![Just(-360.0), Just(0.0), Just(360.0)];
        (-most_deg..most_deg, -most_deg..most_deg, turns)
    }

    /// The reference at the offset from the place, which near a pole comes to
    /// `most_lon_deg` of longitude at most.
    fn reference(at: Position, offset: (f64, f64, f64), most_lon_deg: f64) -> Position {
        let (north_deg, east_deg, turn_deg) = offset;
        let along = east_deg / at.lat_deg.to_radians().cos();
        Position {
            lat_deg: at.lat_deg + north_deg,
            lon_deg: at.lon_deg + along.clamp(-most_lon_deg, most_lon_deg) + turn_deg,
        }
    }

    proptest! {
        #[test]
        fn global_position_is_where_the_later_message_was_sent_from(
            at in place_within_one_count_of_zones(),
            north_deg in -0.02..0.02,
            east_deg in -0.02..0.02,
            later_odd: bool,
        ) {
            // Arrange: the later message sent a little way off the earlier one
            let further = Position {
                lat_deg: at.lat_deg + north_deg,
                lon_deg: at.lon_deg + east_deg,
            };
            let (earlier, later) = (airborne(at, !later_odd), airborne(further, later_odd));

            // Act
            let position = global(earlier, later);

            // Assert
            let position = position.expect("decodes");
            prop_assert!(apart(position, further) < 1e-4, "{position:?}");
            prop_assert!((-180.0..180.0).contains(&position.lon_deg), "{position:?}");
        }

        #[test]
        fn position_near_a_reference_is_where_it_was_sent_from(
            at in place(),
            offset in offset(2.9),
            odd: bool,
        ) {
            // Arrange: seen from up to 174 NM away along either axis
            let reference = reference(at, offset, 170.0);

            // Act
            let position = airborne_near(airborne(at, odd), reference);

            // Assert
            let position = position.expect("decodes");
            prop_assert!(apart(position, at) < 1e-4, "{position:?}");
            prop_assert!((-180.0..180.0).contains(&position.lon_deg), "{position:?}");
        }

        #[test]
        fn surface_position_near_a_reference_is_where_it_was_sent_from(
            at in place(),
            offset in offset(0.7),
            odd: bool,
        ) {
            // Arrange: seen from up to 42 NM away along either axis
            let reference = reference(at, offset, 42.0);

            // Act
            let position = surface_near(surface(at, odd), reference);

            // Assert
            let position = position.expect("decodes");
            prop_assert!(apart(position, at) < 3e-5, "{position:?}");
            prop_assert!((-180.0..180.0).contains(&position.lon_deg), "{position:?}");
        }
    }
}
