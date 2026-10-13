//! The latest report of each station, forgotten once it goes stale.

use std::collections::BTreeMap;

use crate::qnh::Report;

/// Older than this, an hourly report is half an hour overdue, and the setting is suspect.
pub const STALE_S: f64 = 90.0 * 60.0;

/// The latest report of each station, forgotten once it goes stale.
#[derive(Default)]
pub struct Reports {
    latest: BTreeMap<String, Report>,
}

impl Reports {
    /// Takes in what a poll read, keeping each station's newest report, and
    /// forgets what has gone stale at `now_s`; whether the set changed.
    pub fn record(&mut self, heard: impl IntoIterator<Item = Report>, now_s: f64) -> bool {
        let mut changed = false;
        for report in heard {
            let kept = self.latest.get(&report.station);
            let newer = kept.is_none_or(|kept| kept.observed_s <= report.observed_s);
            if newer && kept != Some(&report) {
                self.latest.insert(report.station.clone(), report);
                changed = true;
            }
        }
        self.expire(now_s) || changed
    }

    /// Forgets the reports older than the stale age at `now_s`; whether any was.
    pub fn expire(&mut self, now_s: f64) -> bool {
        let before = self.latest.len();
        self.latest
            .retain(|_, report| now_s - report.observed_s <= STALE_S);
        self.latest.len() < before
    }

    /// The current reports, by station.
    pub fn iter(&self) -> impl Iterator<Item = &Report> {
        self.latest.values()
    }
}

#[cfg(test)]
mod tests {
    use super::{Reports, STALE_S};
    use crate::qnh::Report;

    const NOW_S: f64 = 1_790_076_600.0;
    const MINUTE_S: f64 = 60.0;

    fn report(station: &str, observed_s: f64, qnh_in_hg: f64) -> Report {
        Report {
            station: station.to_owned(),
            observed_s,
            qnh_in_hg,
        }
    }

    fn recorded(reports: &[Report], now_s: f64) -> Reports {
        let mut recorded = Reports::default();
        recorded.record(reports.to_vec(), now_s);
        recorded
    }

    fn current(reports: &Reports) -> Vec<Report> {
        reports.iter().cloned().collect()
    }

    #[test]
    fn each_station_keeps_its_newest_report_by_station_order() {
        // Arrange
        let heard = vec![
            report("RJTT", NOW_S - 60.0 * MINUTE_S, 29.91),
            report("RJTT", NOW_S - 30.0 * MINUTE_S, 29.92),
            report("RJAA", NOW_S - 30.0 * MINUTE_S, 29.94),
        ];
        let mut reports = Reports::default();

        // Act
        let changed = reports.record(heard, NOW_S);

        // Assert
        assert!(changed);
        assert_eq!(
            current(&reports),
            [
                report("RJAA", NOW_S - 30.0 * MINUTE_S, 29.94),
                report("RJTT", NOW_S - 30.0 * MINUTE_S, 29.92),
            ]
        );
    }

    #[test]
    fn older_report_than_the_one_kept_changes_nothing() {
        // Arrange
        let kept = report("RJTT", NOW_S - 30.0 * MINUTE_S, 29.92);
        let mut reports = recorded(std::slice::from_ref(&kept), NOW_S);

        // Act
        let changed = reports.record(vec![report("RJTT", NOW_S - 60.0 * MINUTE_S, 29.91)], NOW_S);

        // Assert
        assert!(!changed);
        assert_eq!(current(&reports), [kept]);
    }

    #[test]
    fn same_reports_heard_again_change_nothing() {
        // Arrange
        let heard = vec![
            report("RJAA", NOW_S - 30.0 * MINUTE_S, 29.94),
            report("RJTT", NOW_S - 30.0 * MINUTE_S, 29.92),
        ];
        let mut reports = recorded(&heard, NOW_S);

        // Act
        let changed = reports.record(heard.clone(), NOW_S + 5.0 * MINUTE_S);

        // Assert
        assert!(!changed);
        assert_eq!(current(&reports), heard);
    }

    #[test]
    fn corrected_report_of_the_same_time_replaces_the_one_kept() {
        // Arrange
        let mut reports = recorded(&[report("RJTT", NOW_S - 30.0 * MINUTE_S, 29.92)], NOW_S);
        let corrected = report("RJTT", NOW_S - 30.0 * MINUTE_S, 29.93);

        // Act
        let changed = reports.record(vec![corrected.clone()], NOW_S);

        // Assert
        assert!(changed);
        assert_eq!(current(&reports), [corrected]);
    }

    #[test]
    fn reports_older_than_the_stale_age_are_forgotten_when_time_passes() {
        // Arrange
        let kept = report("RJAA", NOW_S - STALE_S, 29.94);
        let mut reports = recorded(
            &[report("RJTT", NOW_S - STALE_S - 1.0, 29.92), kept.clone()],
            NOW_S - 1.0,
        );

        // Act
        let changed = reports.expire(NOW_S);

        // Assert
        assert!(changed);
        assert_eq!(current(&reports), [kept]);
    }

    #[test]
    fn recording_forgets_what_has_gone_stale_too() {
        // Arrange
        let mut reports = recorded(&[report("RJTT", NOW_S - 60.0 * MINUTE_S, 29.92)], NOW_S);

        // Act
        let changed = reports.record(vec![], NOW_S - 60.0 * MINUTE_S + STALE_S + 1.0);

        // Assert
        assert!(changed);
        assert_eq!(current(&reports), []);
    }

    #[test]
    fn expiry_with_nothing_stale_changes_nothing() {
        // Arrange
        let kept = report("RJTT", NOW_S - 60.0 * MINUTE_S, 29.92);
        let mut reports = recorded(std::slice::from_ref(&kept), NOW_S);

        // Act
        let changed = reports.expire(NOW_S + 5.0 * MINUTE_S);

        // Assert
        assert!(!changed);
        assert_eq!(current(&reports), [kept]);
    }
}
