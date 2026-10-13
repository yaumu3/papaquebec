//! The weather around the receiver: the QNH of every station in range, polled
//! from the Aviation Weather Center's METARs.

use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use metar::qnh;
use metar::reports::Reports;
use metar::stations::{Station, Stations};
use tokio::sync::watch;
use tracker::proto::Qnh;

use crate::Failure;

/// Where the Center answers with the current METARs of the stations asked for.
pub const METAR: &str = "https://aviationweather.gov/api/data/metar";
/// METARs come half-hourly at most, and the Center takes a request a minute at most.
pub const POLL_EVERY: Duration = Duration::from_mins(5);
/// How far around the site stations are asked: the radius `bun run map` draws the map for.
pub const RANGE_NM: f64 = 150.0;
/// The Center answers for this many stations at most in one request.
const MOST_ASKED: usize = 400;
const ANSWER_WITHIN: Duration = Duration::from_secs(30);

/// Asks the Center at `url` for the stations' current METARs, raw, one a line.
///
/// # Errors
///
/// When the Center cannot be reached or does not answer with the reports.
pub async fn fetch(
    client: reqwest::Client,
    url: String,
    stations: Vec<String>,
) -> Result<String, Failure> {
    let asked = format!("{url}?ids={}&format=raw", stations.join(","));
    let answer = client.get(asked).timeout(ANSWER_WITHIN).send().await?;
    Ok(answer.error_for_status()?.text().await?)
}

/// Polls, through `fetch`, the METARs of the stations within range of the
/// site as soon as they are listed and every `POLL_EVERY` after, and tells the
/// weather: the current QNH of each, as the frame every session is sent,
/// whenever the set changes. For as long as the stations are listed and
/// anyone reads the weather.
pub async fn poll<F, Fut>(
    mut stations: watch::Receiver<Arc<Stations>>,
    site: (f64, f64),
    fetch: F,
    clock: impl Fn() -> f64,
    weather: watch::Sender<Option<Bytes>>,
) where
    F: Fn(Vec<String>) -> Fut,
    Fut: Future<Output = Result<String, Failure>>,
{
    let mut reports = Reports::default();
    let mut reporting = 0;
    let mut asked = in_range(&mut stations, site);
    loop {
        if !asked.is_empty() {
            let now_s = clock();
            let changed = match fetch(asked.keys().cloned().collect()).await {
                Ok(raw) => {
                    let heard = raw.lines().filter_map(|line| qnh::parse(line, now_s));
                    reports.record(heard, now_s)
                }
                Err(failure) => {
                    eprintln!("weather: {failure}");
                    reports.expire(now_s)
                }
            };
            if changed || weather.borrow().is_none() {
                let current = current(&reports, &asked);
                if current.len() != reporting {
                    reporting = current.len();
                    eprintln!(
                        "weather: {reporting} of {} stations within {RANGE_NM} NM report",
                        asked.len()
                    );
                }
                weather.send_replace(Some(feeder::feed::weather(current)));
            }
        }
        // Until the next poll, or until a list names other stations in range.
        let next_poll = tokio::time::sleep(POLL_EVERY);
        tokio::pin!(next_poll);
        loop {
            tokio::select! {
                () = &mut next_poll, if !asked.is_empty() => break,
                changed = stations.changed() => {
                    if changed.is_err() {
                        return;
                    }
                    let listed = in_range(&mut stations, site);
                    if listed != asked {
                        asked = listed;
                        break;
                    }
                }
                () = weather.closed() => return,
            }
        }
    }
}

/// The stations to ask, by identifier: those within range, the nearest when
/// more than one request would take.
fn in_range(
    stations: &mut watch::Receiver<Arc<Stations>>,
    site: (f64, f64),
) -> BTreeMap<String, Station> {
    // Taken out first, so that the list is not held while it is searched.
    let listed = Arc::clone(&stations.borrow_and_update());
    listed
        .within(site, RANGE_NM)
        .into_iter()
        .take(MOST_ASKED)
        .map(|station| (station.id.clone(), station))
        .collect()
}

/// The current reports of the stations asked, with where each stands.
fn current(reports: &Reports, stations: &BTreeMap<String, Station>) -> Vec<Qnh> {
    reports
        .iter()
        .filter_map(|report| {
            let station = stations.get(&report.station)?;
            Some(Qnh {
                station: report.station.clone(),
                lat_deg: station.lat_deg,
                lon_deg: station.lon_deg,
                observed_s: report.observed_s,
                qnh_in_hg: report.qnh_in_hg,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;
    use std::future::{Ready, ready};
    use std::sync::{Arc, Mutex, PoisonError};
    use std::time::Duration;

    use bytes::Bytes;
    use feeder::feed::weather as framed;
    use metar::reports::STALE_S;
    use metar::stations::{Station, Stations};
    use tokio::sync::watch;
    use tokio::time::timeout;
    use tracker::proto::Qnh;

    use super::{POLL_EVERY, fetch, poll};
    use crate::testing::answering;
    use crate::{Failure, client};

    /// Tokyo/Haneda, where the receiver stands in these tests.
    const SITE: (f64, f64) = (35.553, 139.781);
    /// 2026-10-13T11:30:00Z.
    const NOW_S: f64 = 1_791_891_000.0;
    /// 11:00Z that day, when the first reports were observed.
    const OBSERVED_S: f64 = 1_791_889_200.0;
    const METARS: &str = "METAR RJAA 131100Z 05005KT 8000 -RA FEW030 21/19 Q1014 NOSIG\n\
                          METAR RJTT 131100Z 06005KT 9999 FEW020 22/19 Q1013 BECMG 08005KT";
    const LATER: &str = "METAR RJAA 131130Z 05005KT 8000 -RA FEW030 21/19 Q1015 NOSIG\n\
                         METAR RJTT 131130Z 06005KT 9999 FEW020 22/19 Q1013 BECMG 08005KT";

    fn station(id: &str, lat_deg: f64, lon_deg: f64) -> Station {
        Station {
            id: id.to_owned(),
            lat_deg,
            lon_deg,
        }
    }

    /// Haneda and Narita within range, Fukuoka far beyond it.
    fn listed() -> Arc<Stations> {
        let stations = [
            station("RJTT", 35.553, 139.781),
            station("RJAA", 35.765, 140.386),
            station("RJFF", 33.5844, 130.4517),
        ];
        Arc::new(stations.into_iter().collect())
    }

    fn qnh(station: &str, lat_deg: f64, lon_deg: f64, observed_s: f64, qnh_in_hg: f64) -> Qnh {
        Qnh {
            station: station.to_owned(),
            lat_deg,
            lon_deg,
            observed_s,
            qnh_in_hg,
        }
    }

    /// The first reports, as the frame carries them.
    fn first() -> Bytes {
        framed(vec![
            qnh("RJAA", 35.765, 140.386, OBSERVED_S, 29.94),
            qnh("RJTT", 35.553, 139.781, OBSERVED_S, 29.91),
        ])
    }

    /// The Center as scripted: each poll takes the next answer, the last one standing.
    #[derive(Clone)]
    struct Center {
        answers: Arc<Mutex<VecDeque<Result<String, String>>>>,
        asked: Arc<Mutex<Vec<Vec<String>>>>,
        now_s: Arc<Mutex<f64>>,
    }

    impl Center {
        fn answering(answers: &[Result<&str, &str>]) -> Self {
            let answers = answers
                .iter()
                .map(|answer| answer.map(str::to_owned).map_err(str::to_owned))
                .collect();
            Self {
                answers: Arc::new(Mutex::new(answers)),
                asked: Arc::default(),
                now_s: Arc::new(Mutex::new(NOW_S)),
            }
        }

        fn fetch(&self, stations: Vec<String>) -> Ready<Result<String, Failure>> {
            self.asked
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .push(stations);
            let mut answers = self.answers.lock().unwrap_or_else(PoisonError::into_inner);
            let answer = if answers.len() > 1 {
                answers.pop_front()
            } else {
                answers.front().cloned()
            };
            ready(
                answer
                    .unwrap_or_else(|| Err("no answer".to_owned()))
                    .map_err(Failure::from),
            )
        }

        fn asked(&self) -> Vec<Vec<String>> {
            self.asked
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .clone()
        }

        fn now(&self) -> f64 {
            *self.now_s.lock().unwrap_or_else(PoisonError::into_inner)
        }

        fn set_now(&self, now_s: f64) {
            *self.now_s.lock().unwrap_or_else(PoisonError::into_inner) = now_s;
        }
    }

    /// The Center polled, with the stations as listed, and the weather told.
    struct Polled {
        stations: watch::Sender<Arc<Stations>>,
        weather: watch::Receiver<Option<Bytes>>,
    }

    fn polling(center: &Center, stations: Arc<Stations>) -> Polled {
        let (listed, list) = watch::channel(stations);
        let (told, weather) = watch::channel(None);
        let fetching = center.clone();
        let ticking = center.clone();
        let fetch = move |stations| fetching.fetch(stations);
        let clock = move || ticking.now();
        tokio::spawn(poll(list, SITE, fetch, clock, told));
        Polled {
            stations: listed,
            weather,
        }
    }

    /// Lets the poller get to where it waits: the clock stands still until it does.
    async fn settled() {
        tokio::time::sleep(Duration::from_millis(1)).await;
    }

    /// A moment past the next poll.
    async fn next_poll() {
        tokio::time::sleep(POLL_EVERY + Duration::from_secs(1)).await;
    }

    #[tokio::test(start_paused = true)]
    async fn nothing_is_asked_or_told_before_any_station_is_listed() {
        // Arrange
        let center = Center::answering(&[Ok(METARS)]);
        let polled = polling(&center, Arc::new(Stations::default()));

        // Act
        settled().await;

        // Assert
        assert_eq!(center.asked(), Vec::<Vec<String>>::new());
        assert_eq!(*polled.weather.borrow(), None);
    }

    #[tokio::test(start_paused = true)]
    async fn stations_in_range_are_asked_as_soon_as_they_are_listed() {
        // Arrange
        let center = Center::answering(&[Ok(METARS)]);
        let polled = polling(&center, Arc::new(Stations::default()));
        polled.stations.send_replace(listed());

        // Act
        settled().await;

        // Assert
        assert_eq!(center.asked(), [["RJAA", "RJTT"]]);
    }

    #[tokio::test(start_paused = true)]
    async fn current_reports_are_told_with_where_their_stations_stand() {
        // Arrange
        let center = Center::answering(&[Ok(METARS)]);
        let polled = polling(&center, listed());

        // Act
        settled().await;

        // Assert
        assert_eq!(*polled.weather.borrow(), Some(first()));
    }

    #[tokio::test(start_paused = true)]
    async fn same_stations_listed_again_are_not_asked_before_the_next_poll() {
        // Arrange
        let center = Center::answering(&[Ok(METARS)]);
        let polled = polling(&center, listed());
        settled().await;
        polled.stations.send_replace(listed());

        // Act
        settled().await;

        // Assert
        assert_eq!(center.asked().len(), 1);
    }

    #[tokio::test(start_paused = true)]
    async fn stations_are_asked_again_every_poll() {
        // Arrange
        let center = Center::answering(&[Ok(METARS)]);
        let _polled = polling(&center, listed());
        settled().await;

        // Act
        next_poll().await;

        // Assert
        assert_eq!(center.asked().len(), 2);
    }

    #[tokio::test(start_paused = true)]
    async fn weather_is_told_again_only_when_the_reports_change() {
        // Arrange
        let center = Center::answering(&[Ok(METARS)]);
        let mut polled = polling(&center, listed());
        settled().await;
        polled.weather.mark_unchanged();

        // Act
        next_poll().await;

        // Assert
        assert_eq!(polled.weather.has_changed().ok(), Some(false));
    }

    #[tokio::test(start_paused = true)]
    async fn changed_reports_are_told() {
        // Arrange
        let center = Center::answering(&[Ok(METARS), Ok(LATER)]);
        let mut polled = polling(&center, listed());
        settled().await;
        polled.weather.mark_unchanged();

        // Act
        next_poll().await;

        // Assert
        assert_eq!(polled.weather.has_changed().ok(), Some(true));
        assert_eq!(
            *polled.weather.borrow(),
            Some(framed(vec![
                qnh("RJAA", 35.765, 140.386, NOW_S, 29.97),
                qnh("RJTT", 35.553, 139.781, NOW_S, 29.91),
            ]))
        );
    }

    #[tokio::test(start_paused = true)]
    async fn reports_gone_stale_are_dropped_even_when_a_poll_fails() {
        // Arrange
        let center = Center::answering(&[Ok(METARS), Err("HTTP 503")]);
        let polled = polling(&center, listed());
        settled().await;
        center.set_now(OBSERVED_S + STALE_S + 1.0);

        // Act
        next_poll().await;

        // Assert
        assert_eq!(*polled.weather.borrow(), Some(framed(vec![])));
    }

    #[tokio::test(start_paused = true)]
    async fn failed_first_poll_tells_that_no_station_reports() {
        // Arrange
        let center = Center::answering(&[Err("HTTP 503")]);
        let polled = polling(&center, listed());

        // Act
        settled().await;

        // Assert
        assert_eq!(*polled.weather.borrow(), Some(framed(vec![])));
    }

    #[tokio::test(start_paused = true)]
    async fn polling_ends_once_nobody_reads_the_weather() {
        // Arrange
        let center = Center::answering(&[Ok(METARS)]);
        let (_listed, list) = watch::channel(listed());
        let (told, weather) = watch::channel(None);
        let fetching = center.clone();
        let ticking = center.clone();
        let fetch = move |stations| fetching.fetch(stations);
        let clock = move || ticking.now();
        drop(weather);

        // Act
        let ended = timeout(Duration::from_secs(5), poll(list, SITE, fetch, clock, told)).await;

        // Assert
        assert_eq!(ended, Ok(()));
    }

    #[tokio::test]
    async fn center_is_asked_for_the_stations_raw_metars() {
        // Arrange
        let (url, asked) = answering("/api/data/metar", "200 OK", METARS.as_bytes()).await;

        // Act
        let answer = fetch(client(), url, vec!["RJAA".to_owned(), "RJTT".to_owned()]).await;

        // Assert
        assert_eq!(answer.map_err(|e| e.to_string()), Ok(METARS.to_owned()));
        assert_eq!(
            asked.targets(),
            ["/api/data/metar?ids=RJAA,RJTT&format=raw"]
        );
    }
}
