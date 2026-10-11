//! Air data in the standard atmosphere: what the speeds through the air say
//! together, by the ISA of ICAO Doc 7488 and the subsonic airspeed relations.

/// Sea level in the standard atmosphere: the temperature and the speed of sound.
const SEA_LEVEL_K: f64 = 288.15;
const SEA_LEVEL_SOUND_KT: f64 = 661.4786;
/// The temperature falls at this rate up to the tropopause, and holds above it.
const LAPSE_K_PER_FT: f64 = 0.001_981_2;
const TROPOPAUSE_FT: f64 = 36_089.24;
const TROPOPAUSE_K: f64 = 216.65;
/// The pressure at the tropopause against sea level, and the height above it
/// over which the pressure falls by the factor e.
const TROPOPAUSE_PRESSURE: f64 = 0.223_36;
const SCALE_HEIGHT_FT: f64 = 20_805.8;
/// The power of the temperature that the pressure falls as in the troposphere.
const TROPOSPHERE_POWER: f64 = 5.255_88;
const KELVIN_AT_0_C: f64 = 273.15;

/// The temperature at the pressure altitude against the one at sea level.
fn temperature_ratio(pressure_altitude_ft: f64) -> f64 {
    (SEA_LEVEL_K - LAPSE_K_PER_FT * pressure_altitude_ft).max(TROPOPAUSE_K) / SEA_LEVEL_K
}

/// The pressure at the pressure altitude against the one at sea level.
fn pressure_ratio(pressure_altitude_ft: f64) -> f64 {
    if pressure_altitude_ft <= TROPOPAUSE_FT {
        temperature_ratio(pressure_altitude_ft).powf(TROPOSPHERE_POWER)
    } else {
        TROPOPAUSE_PRESSURE * (-(pressure_altitude_ft - TROPOPAUSE_FT) / SCALE_HEIGHT_FT).exp()
    }
}

/// The calibrated airspeed the Mach number reads as at the pressure altitude:
/// the impact pressure it raises there, read on the scale of sea level.
#[must_use]
pub fn calibrated_airspeed_kt(mach: f64, pressure_altitude_ft: f64) -> f64 {
    let impact = pressure_ratio(pressure_altitude_ft) * ((1.0 + 0.2 * mach * mach).powf(3.5) - 1.0);
    SEA_LEVEL_SOUND_KT * (5.0 * ((impact + 1.0).powf(2.0 / 7.0) - 1.0)).sqrt()
}

/// The Mach number of the true airspeed at the pressure altitude, in air of
/// the standard temperature there.
#[must_use]
pub fn mach(true_airspeed_kt: f64, pressure_altitude_ft: f64) -> f64 {
    true_airspeed_kt / (SEA_LEVEL_SOUND_KT * temperature_ratio(pressure_altitude_ft).sqrt())
}

/// The static air temperature the true airspeed stands for at the Mach
/// number; none without a Mach number to stand against.
#[must_use]
pub fn static_air_temperature_c(mach: f64, true_airspeed_kt: f64) -> Option<f64> {
    if mach <= 0.0 {
        return None;
    }
    let sound_kt = true_airspeed_kt / mach;
    Some(SEA_LEVEL_K * (sound_kt / SEA_LEVEL_SOUND_KT).powi(2) - KELVIN_AT_0_C)
}

/// The total air temperature: the static one raised by the air brought to
/// rest against the aircraft at the Mach number.
#[must_use]
pub fn total_air_temperature_c(static_c: f64, mach: f64) -> f64 {
    (static_c + KELVIN_AT_0_C) * (1.0 + 0.2 * mach * mach) - KELVIN_AT_0_C
}

/// A wind: where it blows from, and how fast.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Wind {
    pub from_deg: f64,
    pub speed_kt: f64,
}

/// The wind that carries an aircraft heading one way through the air along
/// its track over the ground: the ground vector less the air vector.
#[must_use]
pub fn wind(track_deg: f64, ground_speed_kt: f64, heading_deg: f64, true_airspeed_kt: f64) -> Wind {
    let (ground_east, ground_north) = toward(track_deg, ground_speed_kt);
    let (air_east, air_north) = toward(heading_deg, true_airspeed_kt);
    let (toward_deg, speed_kt) = bearing_of(ground_east - air_east, ground_north - air_north);
    Wind {
        from_deg: (toward_deg + 180.0).rem_euclid(360.0),
        speed_kt,
    }
}

/// The heading and the true airspeed of an aircraft that makes the track at
/// the ground speed in the wind: the ground vector less the wind.
#[must_use]
pub fn through_air(track_deg: f64, ground_speed_kt: f64, wind: Wind) -> (f64, f64) {
    let (ground_east, ground_north) = toward(track_deg, ground_speed_kt);
    let (wind_east, wind_north) = toward(wind.from_deg + 180.0, wind.speed_kt);
    bearing_of(ground_east - wind_east, ground_north - wind_north)
}

/// The components east and north of a speed on a bearing.
fn toward(bearing_deg: f64, speed_kt: f64) -> (f64, f64) {
    let (sin, cos) = bearing_deg.to_radians().sin_cos();
    (speed_kt * sin, speed_kt * cos)
}

/// The bearing and the speed of the components east and north.
fn bearing_of(east: f64, north: f64) -> (f64, f64) {
    (
        east.atan2(north).to_degrees().rem_euclid(360.0),
        east.hypot(north),
    )
}

#[cfg(test)]
// Compared once rounded to the digit the reference gives.
#[allow(clippy::float_cmp)]
mod tests {
    use super::{
        Wind, calibrated_airspeed_kt, mach, pressure_ratio, static_air_temperature_c,
        temperature_ratio, through_air, total_air_temperature_c, wind,
    };

    /// Rounded to the hundredth.
    fn hundredths(value: f64) -> f64 {
        (value * 100.0).round() / 100.0
    }

    #[test]
    fn pressure_falls_through_the_troposphere_and_on_above_the_tropopause() {
        // Arrange: sea level, the tropopause, and three of the table's rows
        let altitudes = [0.0, 10_000.0, 35_000.0, 36_089.24, 50_000.0];

        // Act
        let pressures = altitudes.map(|altitude| pressure_ratio(altitude) * 1013.25);

        // Assert: Doc 7488, to a hundredth of a hectopascal
        let expected = [1013.25, 696.82, 238.42, 226.32, 115.97];
        assert_eq!(pressures.map(hundredths), expected);
    }

    #[test]
    fn temperature_falls_to_the_tropopause_and_holds_above_it() {
        // Arrange
        let altitudes = [0.0, 10_000.0, 35_000.0, 40_000.0];

        // Act
        let temperatures = altitudes.map(|altitude| temperature_ratio(altitude) * 288.15);

        // Assert: Doc 7488, to a hundredth of a kelvin
        let expected = [288.15, 268.34, 218.81, 216.65];
        assert_eq!(temperatures.map(hundredths), expected);
    }

    #[test]
    fn calibrated_airspeed_is_what_the_mach_number_reads_as_at_the_altitude() {
        // Arrange: a cruise, a descent, and sea level
        let read = [(0.78, 35_000.0), (0.644, 14_000.0), (0.48, 0.0)];

        // Act
        let speeds = read.map(|(mach, altitude)| calibrated_airspeed_kt(mach, altitude));

        // Assert: to a tenth of a knot
        let tenths = speeds.map(|speed| (speed * 10.0).round() / 10.0);
        assert_eq!(tenths, [264.4, 333.0, 317.5]);
    }

    #[test]
    fn mach_number_is_of_the_true_airspeed_in_the_standard_air_at_the_altitude() {
        // Arrange
        let flown = [(460.0, 35_000.0), (290.0, 11_000.0)];

        // Act
        let machs = flown.map(|(true_airspeed_kt, altitude)| mach(true_airspeed_kt, altitude));

        // Assert: to a thousandth
        let thousandths = machs.map(|mach| (mach * 1000.0).round() / 1000.0);
        assert_eq!(thousandths, [0.798, 0.456]);
    }

    #[test]
    fn static_air_temperature_is_what_the_speeds_stand_for() {
        // Arrange: warmer than standard, standard at 35 000 ft, and no Mach number
        let read = [(0.78, 460.0), (0.78, 449.6), (0.0, 460.0)];

        // Act
        let temperatures = read.map(|(mach, tas)| static_air_temperature_c(mach, tas));

        // Assert
        let expected = [Some(-44.11), Some(-54.35), None];
        assert_eq!(temperatures.map(|c| c.map(hundredths)), expected);
    }

    #[test]
    fn total_air_temperature_rises_with_the_mach_number() {
        // Arrange
        let read = [(-44.11, 0.78), (15.0, 0.0)];

        // Act
        let temperatures = read.map(|(static_c, mach)| total_air_temperature_c(static_c, mach));

        // Assert
        assert_eq!(temperatures.map(hundredths), [-16.24, 15.0]);
    }

    #[test]
    fn air_vector_is_the_ground_vector_less_the_wind() {
        // Arrange: a tail wind, and one from the quarter
        let winds = [(90.0, 480.0, 270.0, 30.0), (235.0, 290.0, 306.28, 27.61)];

        // Act
        let flown = winds.map(|(track, gs, from_deg, speed_kt)| {
            through_air(track, gs, Wind { from_deg, speed_kt })
        });

        // Assert: to a hundredth of a degree and a knot
        let rounded = flown.map(|(heading, tas)| (hundredths(heading), hundredths(tas)));
        assert_eq!(rounded, [(90.0, 450.0), (240.0, 300.0)]);
    }

    #[test]
    fn wind_is_what_the_ground_vector_differs_from_the_air_vector_by() {
        // Arrange: a tail wind, a head wind, a cross wind, and one from the quarter
        let flown = [
            (90.0, 480.0, 90.0, 450.0),
            (90.0, 420.0, 90.0, 450.0),
            (0.0, 300.0, 10.0, 300.0),
            (235.0, 290.0, 240.0, 300.0),
        ];

        // Act
        let winds = flown.map(|(track, gs, heading, tas)| wind(track, gs, heading, tas));

        // Assert: to a hundredth, blowing from the direction
        let rounded = winds.map(|wind| (hundredths(wind.from_deg), hundredths(wind.speed_kt)));
        let expected = [(270.0, 30.0), (90.0, 30.0), (95.0, 52.29), (306.28, 27.61)];
        assert_eq!(rounded, expected);
    }
}
