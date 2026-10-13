//! The altimeter setting a METAR carries.

use time::{Date, Month, OffsetDateTime, Time};

/// The QNH a station reported, and when.
#[derive(Clone, Debug, PartialEq)]
pub struct Report {
    /// The station's ICAO identifier.
    pub station: String,
    /// When it was observed, Unix seconds.
    pub observed_s: f64,
    /// Rounded to a hundredth.
    pub qnh_in_hg: f64,
}

/// Hectopascals in an inch of mercury, to four places.
const HPA_PER_INHG: f64 = 33.8639;

/// Pulls the station, the observation time and the QNH out of a raw METAR;
/// none when any of them is missing. `now_s` places the day of the month the
/// report names: a day later than today's belongs to the previous month.
#[must_use]
pub fn parse(raw: &str, now_s: f64) -> Option<Report> {
    let tokens: Vec<&str> = raw.split_whitespace().collect();
    let (station, time) = tokens
        .windows(2)
        .find_map(|pair| Some((station(pair[0])?, time(pair[1])?)))?;
    let q = tokens.iter().find_map(|token| group(token, 'Q'));
    let a = tokens.iter().find_map(|token| group(token, 'A'));
    let qnh_in_hg = match (q, a) {
        (Some(hpa), _) => hpa_to_in_hg(f64::from(hpa)),
        (None, Some(hundredths)) => f64::from(hundredths) / 100.0,
        (None, None) => return None,
    };
    Some(Report {
        station: station.to_owned(),
        observed_s: observed_s(time, now_s)?,
        qnh_in_hg,
    })
}

fn hpa_to_in_hg(hpa: f64) -> f64 {
    (hpa / HPA_PER_INHG * 100.0).round() / 100.0
}

/// A letter and three letters or digits: an ICAO identifier.
fn station(token: &str) -> Option<&str> {
    let mut chars = token.chars();
    let first = chars.next()?;
    let rest: Vec<char> = chars.collect();
    let is_id = first.is_ascii_uppercase()
        && rest.len() == 3
        && rest
            .iter()
            .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit());
    is_id.then_some(token)
}

/// `ddhhmmZ`: the day of the month, hour and minute.
fn time(token: &str) -> Option<(u8, u8, u8)> {
    let digits = token.strip_suffix('Z')?;
    if digits.len() != 6 || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let field = |at: usize| digits[at..at + 2].parse().ok();
    Some((field(0)?, field(2)?, field(4)?))
}

/// The four digits after the letter, when nothing of a word follows them.
fn group(token: &str, letter: char) -> Option<u32> {
    let (digits, after) = token.strip_prefix(letter)?.split_at_checked(4)?;
    let ends_word = after
        .chars()
        .next()
        .is_none_or(|c| !(c.is_ascii_alphanumeric() || c == '_'));
    let all_digits = digits.bytes().all(|b| b.is_ascii_digit());
    (ends_word && all_digits).then(|| digits.parse().ok())?
}

/// The observation as Unix seconds, in the month of `now_s`, or in the one
/// before when its day of the month is yet to come; none when that month has
/// no such day, or the time is not one.
#[allow(clippy::cast_possible_truncation, clippy::cast_precision_loss)]
fn observed_s((day, hour, minute): (u8, u8, u8), now_s: f64) -> Option<f64> {
    let now = OffsetDateTime::from_unix_timestamp(now_s.floor() as i64).ok()?;
    let (year, month) = match (day > now.day(), now.month()) {
        (false, month) => (now.year(), month),
        (true, Month::January) => (now.year() - 1, Month::December),
        (true, month) => (now.year(), month.previous()),
    };
    let date = Date::from_calendar_date(year, month, day).ok()?;
    let time = Time::from_hms(hour, minute, 0).ok()?;
    Some(date.with_time(time).assume_utc().unix_timestamp() as f64)
}

#[cfg(test)]
mod tests {
    use super::{Report, parse};

    /// 2026-09-22T11:30:00Z.
    const NOW_S: f64 = 1_790_076_600.0;

    #[test]
    fn report_gives_the_station_the_observation_time_and_a_q_group_in_hpa() {
        // Arrange
        let raw = "RJAA 221100Z 10005KT 9999 VCSH FEW045 23/22 Q1014 NOSIG";

        // Act
        let report = parse(raw, NOW_S);

        // Assert
        assert_eq!(
            report,
            Some(Report {
                station: "RJAA".to_owned(),
                observed_s: 1_790_074_800.0, // 2026-09-22T11:00:00Z
                qnh_in_hg: 29.94,
            })
        );
    }

    #[test]
    fn report_gives_an_a_group_in_hundredths_of_in_hg_and_tolerates_a_metar_prefix() {
        // Arrange
        let raw = "METAR KJFK 221051Z 18004KT 10SM FEW250 24/16 A3003 RMK AO2";

        // Act
        let report = parse(raw, NOW_S);

        // Assert
        assert_eq!(
            report,
            Some(Report {
                station: "KJFK".to_owned(),
                observed_s: 1_790_074_260.0, // 2026-09-22T10:51:00Z
                qnh_in_hg: 30.03,
            })
        );
    }

    #[test]
    fn observation_day_later_than_today_falls_in_the_previous_month() {
        // Arrange
        let raw = "RJAA 302350Z 00000KT CAVOK 20/10 Q1020";
        let early_october = 1_790_814_000.0; // 2026-10-01T00:20:00Z

        // Act
        let report = parse(raw, early_october);

        // Assert
        assert_eq!(
            report.map(|r| r.observed_s),
            Some(1_790_812_200.0) // 2026-09-30T23:50:00Z
        );
    }

    #[test]
    fn previous_month_of_january_is_december_of_the_year_before() {
        // Arrange
        let raw = "RJAA 312350Z 00000KT CAVOK 20/10 Q1020";
        let early_january = 1_798_762_200.0; // 2027-01-01T00:10:00Z

        // Act
        let report = parse(raw, early_january);

        // Assert
        assert_eq!(
            report.map(|r| r.observed_s),
            Some(1_798_761_000.0) // 2026-12-31T23:50:00Z
        );
    }

    #[test]
    fn report_dated_on_a_day_its_month_lacks_is_none() {
        // Arrange: the 31st, which September, the month before, does not have
        let raw = "RJAA 312350Z 00000KT CAVOK 20/10 Q1020";
        let early_october = 1_790_814_000.0; // 2026-10-01T00:20:00Z

        // Act
        let report = parse(raw, early_october);

        // Assert
        assert_eq!(report, None);
    }

    #[test]
    fn report_is_none_without_a_pressure_group_or_a_header() {
        // Arrange
        let raws = [
            "RJAA 221100Z 10005KT CAVOK 23/22",
            "",
            "No METAR available for XXXX",
        ];

        // Act
        let reports = raws.map(|raw| parse(raw, NOW_S));

        // Assert
        assert_eq!(reports, [None, None, None]);
    }
}
