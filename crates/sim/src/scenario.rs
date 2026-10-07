//! Traffic for judging the scope's data block placement around RJTT, placed from the AIP
//! around the site the sim flies by default: arrival streams onto 34L and 34R that merge, run
//! parallel or cross on the way, departures off 34R and 05, whose climb-out crosses the 34R
//! final, and a background of aircraft crossing the area on straight tracks.

use std::str::FromStr;

use crate::fleet::Leg;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scenario {
    /// Two streams from either side merge 12 NM out onto the final for 34L, seen en route.
    Merge,
    /// 34L and 34R, each stream joining its own final from its own side at 30°, the two joins
    /// staggered along the approach.
    Parallel,
    /// The same runways, each stream landing on the far one, so the joining legs cross on the
    /// way, a thousand feet apart.
    Cross,
    /// The south wind: streams onto the converging runways 22 and 23, each from its own side,
    /// with departures off 16L and 16R.
    Converging,
    /// Only the background: aircraft on straight tracks, a wide area of them.
    Random,
}

impl FromStr for Scenario {
    type Err = String;

    fn from_str(name: &str) -> Result<Self, Self::Err> {
        Self::ALL
            .into_iter()
            .find(|s| s.name() == name)
            .ok_or_else(|| {
                let names: Vec<&str> = Self::ALL.iter().map(|s| s.name()).collect();
                format!("{name}: not one of {}", names.join(", "))
            })
    }
}

/// A runway by its threshold, NM east and north of the site, and the true bearing of a
/// landing or a take-off from it, degrees.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Runway {
    pub x: f64,
    pub y: f64,
    pub bearing_deg: f64,
}

/// RJTT 34L, from its threshold.
const RWY_34L: Runway = Runway {
    x: 0.2231,
    y: -1.0020,
    bearing_deg: 329.88,
};
/// RJTT 34R, from its displaced threshold, 0.92 NM to the right of 34L.
const RWY_34R: Runway = Runway {
    x: 1.0764,
    y: -0.6477,
    bearing_deg: 329.88,
};
/// RJTT 05, from its threshold, under the 34R approach.
const RWY_05: Runway = Runway {
    x: 1.0918,
    y: -1.7578,
    bearing_deg: 42.56,
};
/// RJTT 22 and 23, the converging pair landed on in the south wind.
const RWY_22: Runway = Runway {
    x: -0.1946,
    y: 0.8500,
    bearing_deg: 215.01,
};
const RWY_23: Runway = Runway {
    x: 2.0021,
    y: -0.7622,
    bearing_deg: 222.56,
};
/// RJTT 16L and 16R, from their displaced thresholds, departed from in the south wind.
const RWY_16L: Runway = Runway {
    x: 0.3713,
    y: 0.5732,
    bearing_deg: 149.88,
};
const RWY_16R: Runway = Runway {
    x: -0.4579,
    y: 0.1765,
    bearing_deg: 149.88,
};

impl Runway {
    /// Unit vector of its bearing.
    fn heading(self) -> (f64, f64) {
        let rad = self.bearing_deg.to_radians();
        (rad.sin(), rad.cos())
    }

    /// The point `nm` out on final, before the threshold.
    #[must_use]
    fn on_final(self, nm: f64) -> (f64, f64) {
        let (ux, uy) = self.heading();
        (self.x - nm * ux, self.y - nm * uy)
    }

    /// How far along its bearing a point is from the threshold, negative before it, and how
    /// far to the right of its course.
    #[must_use]
    pub fn relative(self, x: f64, y: f64) -> (f64, f64) {
        let (ux, uy) = self.heading();
        let (dx, dy) = (x - self.x, y - self.y);
        (dx * ux + dy * uy, dx * uy - dy * ux)
    }
}

/// One stream of aircraft down a route, one every `interval_s`, the first `phase` of an
/// interval along.
pub(crate) struct Stream {
    pub route: Vec<Leg>,
    pub interval_s: f64,
    pub phase: f64,
}

const FINAL_KT: f64 = 140.0;
const JOINING_KT: f64 = 160.0;
const EN_ROUTE_KT: f64 = 250.0;
/// Three degrees down: feet per mile out.
const GLIDE_FT_PER_NM: f64 = 318.0;
const THRESHOLD_FT: f64 = 50.0;
/// Arrivals three to four miles apart on final: seconds between them.
const FINAL_INTERVAL_S: f64 = 90.0;
/// Seconds between departures off one runway.
const DEPARTURE_INTERVAL_S: f64 = 150.0;
/// How far a departure climbs straight ahead before it turns, NM.
const CLIMB_OUT_NM: f64 = 4.0;
/// How far out a departure flies before it starts over, NM.
const DEPARTURE_OUT_NM: f64 = 40.0;

const fn leg(x: f64, y: f64, alt: f64, gs: f64) -> Leg {
    Leg { x, y, alt, gs }
}

/// The point `nm` from `from` along a heading of `deg`.
fn ahead(from: (f64, f64), deg: f64, nm: f64) -> (f64, f64) {
    (
        from.0 + nm * deg.to_radians().sin(),
        from.1 + nm * deg.to_radians().cos(),
    )
}

/// A route onto `runway`: a leg `nm` long at `side_deg` off the final, flown at `entry_kt`
/// from `alt`, joining `join_nm` out and meeting the glide path there if it is below, then
/// down the final to the threshold.
fn joining(
    runway: Runway,
    join_nm: f64,
    side_deg: f64,
    nm: f64,
    alt: f64,
    entry_kt: f64,
) -> Vec<Leg> {
    let join = runway.on_final(join_nm);
    let entry = ahead(join, runway.bearing_deg + side_deg + 180.0, nm);
    let on_glide = (join_nm * GLIDE_FT_PER_NM).min(alt);
    vec![
        leg(entry.0, entry.1, alt, entry_kt),
        leg(join.0, join.1, on_glide, FINAL_KT),
        leg(runway.x, runway.y, THRESHOLD_FT, FINAL_KT),
    ]
}

/// A route off `runway`: straight ahead on the climb-out, then onto a heading of `turn_deg`
/// and out of the area, climbing all the way.
fn departing(runway: Runway, turn_deg: f64) -> Vec<Leg> {
    let climb_out = ahead((runway.x, runway.y), runway.bearing_deg, CLIMB_OUT_NM);
    let out = ahead(climb_out, turn_deg, DEPARTURE_OUT_NM);
    vec![
        leg(runway.x, runway.y, THRESHOLD_FT, 150.0),
        leg(climb_out.0, climb_out.1, 2500.0, 200.0),
        leg(out.0, out.1, 12000.0, 300.0),
    ]
}

fn stream(route: Vec<Leg>, interval_s: f64, phase: f64) -> Stream {
    Stream {
        route,
        interval_s,
        phase,
    }
}

impl Scenario {
    pub const ALL: [Self; 5] = [
        Self::Merge,
        Self::Parallel,
        Self::Cross,
        Self::Converging,
        Self::Random,
    ];

    /// Its name, as `PQ_SIM_SCENARIO` and the benchmark give it.
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Self::Merge => "merge",
            Self::Parallel => "parallel",
            Self::Cross => "cross",
            Self::Converging => "converging",
            Self::Random => "random",
        }
    }

    /// The range the scope should show it at, NM: en route for the merge and the random
    /// background, approach for the rest, the crossing legs included.
    #[must_use]
    pub fn range_nm(self) -> f64 {
        match self {
            Self::Merge | Self::Random => 40.0,
            Self::Parallel | Self::Converging => 10.0,
            Self::Cross => 15.0,
        }
    }

    /// How many background aircraft cross its range.
    #[must_use]
    pub fn background(self) -> u32 {
        match self {
            Self::Merge => 30,
            Self::Parallel | Self::Cross | Self::Converging => 6,
            Self::Random => 40,
        }
    }

    /// The runways it lands on, the left one first.
    #[must_use]
    pub fn runways(self) -> Vec<Runway> {
        match self {
            Self::Merge => vec![RWY_34L],
            Self::Parallel | Self::Cross => vec![RWY_34L, RWY_34R],
            Self::Converging => vec![RWY_22, RWY_23],
            Self::Random => vec![],
        }
    }

    /// Its arrival streams, the second of each pair half an interval behind the first, and
    /// its departures: off 34R, turning right over the bay, and off 05 in the north wind, off
    /// 16L and 16R in the south. The spacing, where the streams join and how sharply, the
    /// departures' headings and their spacing are drawn by `random` and held for the run, so
    /// no two seeds fly quite the same traffic.
    pub(crate) fn streams(self, random: &mut impl FnMut() -> f64) -> Vec<Stream> {
        let spacing = FINAL_INTERVAL_S * (0.85 + 0.3 * random());
        let shift = -2.0 + 4.0 * random();
        let side = 25.0 + 10.0 * random();
        let between = DEPARTURE_INTERVAL_S * (0.8 + 0.4 * random());
        let join = |runway: Runway, join_nm: f64, side_deg: f64, nm: f64, alt: f64, kt: f64| {
            joining(runway, (join_nm + shift).max(5.0), side_deg, nm, alt, kt)
        };
        let (l, r) = (RWY_34L, RWY_34R);
        let mut streams = match self {
            Self::Merge => vec![
                stream(
                    join(l, 12.0, 45.0, 18.0, 8000.0, EN_ROUTE_KT),
                    2.0 * spacing,
                    0.0,
                ),
                stream(
                    join(l, 12.0, -45.0, 18.0, 8000.0, EN_ROUTE_KT),
                    2.0 * spacing,
                    0.5,
                ),
            ],
            Self::Parallel => vec![
                stream(join(l, 8.0, side, 10.0, 3000.0, JOINING_KT), spacing, 0.0),
                stream(join(r, 12.0, -side, 10.0, 4000.0, JOINING_KT), spacing, 0.5),
            ],
            Self::Cross => {
                // Level until the join, a thousand feet apart where the legs cross.
                let high = (12.7 + shift).max(5.0) * GLIDE_FT_PER_NM;
                vec![
                    stream(join(r, 12.7, side, 12.0, high, JOINING_KT), spacing, 0.0),
                    stream(
                        join(l, 12.7, -side, 12.0, high - 1000.0, JOINING_KT),
                        spacing,
                        0.5,
                    ),
                ]
            }
            Self::Converging => vec![
                stream(
                    join(RWY_22, 8.0, -side, 10.0, 3000.0, JOINING_KT),
                    spacing,
                    0.0,
                ),
                stream(
                    join(RWY_23, 12.0, side, 10.0, 4000.0, JOINING_KT),
                    spacing,
                    0.5,
                ),
            ],
            Self::Random => return vec![],
        };
        let departures = match self {
            Self::Converging => [
                (RWY_16L, RWY_16L.bearing_deg - 50.0 - random() * 40.0),
                (RWY_16R, RWY_16R.bearing_deg + 50.0 + random() * 40.0),
            ],
            _ => [
                (RWY_34R, RWY_34R.bearing_deg + 50.0 + random() * 40.0),
                (RWY_05, RWY_05.bearing_deg - 20.0 + random() * 40.0),
            ],
        };
        for (runway, heading) in departures {
            streams.push(stream(departing(runway, heading), between, random()));
        }
        streams
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use feeder::position::Position;

    use super::{RWY_05, RWY_16L, RWY_16R, RWY_22, RWY_23, RWY_34L, RWY_34R, Runway};
    use crate::{Fleet, Scenario, State};
    use placer::rng::mulberry32;

    /// RJFF
    const SITE: Position = Position {
        lat_deg: 33.5844,
        lon_deg: 130.4517,
    };

    /// A scenario fleet at second 1000 and the hand that moves its clock.
    fn fleet(scenario: Scenario, seed: u32) -> (Fleet, impl Fn(f64)) {
        fleet_with(scenario, seed, 0)
    }

    /// The same with `extra` background aircraft.
    fn fleet_with(scenario: Scenario, seed: u32, extra: u32) -> (Fleet, impl Fn(f64)) {
        let now = Arc::new(Mutex::new(1000.0));
        let hand = Arc::clone(&now);
        let fleet = Fleet::scenario(
            SITE,
            move || *now.lock().expect("clock"),
            scenario,
            seed,
            extra,
        );
        (fleet, move |seconds| {
            *hand.lock().expect("clock") += seconds;
        })
    }

    /// Whether a point is established on `runway`'s final, within `out_nm`.
    fn on_final(runway: Runway, x: f64, y: f64, out_nm: f64) -> bool {
        let (along, right) = runway.relative(x, y);
        right.abs() < 0.2 && along > -out_nm && along < 0.0
    }

    /// Where two segments cross, if they do.
    fn crossing(a: ((f64, f64), (f64, f64)), b: ((f64, f64), (f64, f64))) -> Option<(f64, f64)> {
        let (ax, ay) = (a.1.0 - a.0.0, a.1.1 - a.0.1);
        let (bx, by) = (b.1.0 - b.0.0, b.1.1 - b.0.1);
        let det = ax * by - ay * bx;
        if det.abs() < 1e-9 {
            return None;
        }
        let (dx, dy) = (b.0.0 - a.0.0, b.0.1 - a.0.1);
        let s = (dx * by - dy * bx) / det;
        let t = (dx * ay - dy * ax) / det;
        ((0.0..=1.0).contains(&s) && (0.0..=1.0).contains(&t))
            .then_some((a.0.0 + s * ax, a.0.1 + s * ay))
    }

    #[test]
    fn parallel_streams_are_spaced_on_their_own_final() {
        // Arrange
        let (mut fleet, advance) = fleet(Scenario::Parallel, 1);
        for _ in 0..120 {
            advance(1.0);
            fleet.fly();
        }

        // Act
        let mut along_34l: Vec<f64> = fleet
            .states()
            .filter(|s| on_final(RWY_34L, s.x, s.y, 8.0))
            .map(|s| RWY_34L.relative(s.x, s.y).0)
            .collect();

        // Assert
        along_34l.sort_by(f64::total_cmp);
        assert!(along_34l.len() >= 2, "{along_34l:?}");
        let gaps: Vec<f64> = along_34l.windows(2).map(|w| w[1] - w[0]).collect();
        assert!(gaps.iter().all(|g| *g >= 2.5), "{gaps:?}");
    }

    #[test]
    fn crossing_streams_pass_the_crossing_a_thousand_feet_apart() {
        // Arrange
        let streams = Scenario::Cross.streams(&mut mulberry32(1));
        let leg = |n: usize| {
            (
                (streams[n].route[0].x, streams[n].route[0].y),
                (streams[n].route[1].x, streams[n].route[1].y),
            )
        };
        let at = crossing(leg(0), leg(1)).expect("the joining legs cross");
        let (mut fleet, advance) = fleet(Scenario::Cross, 1);
        let mut levels: Vec<f64> = Vec::new();

        // Act
        for _ in 0..600 {
            advance(1.0);
            fleet.fly();
            let passing = fleet
                .states()
                .filter(|s| (s.x - at.0).hypot(s.y - at.1) < 0.3)
                .map(|s| s.alt_ft);
            levels.extend(passing);
        }

        // Assert
        let highest = levels.iter().copied().fold(f64::MIN, f64::max);
        let lowest = levels.iter().copied().fold(f64::MAX, f64::min);
        assert!(levels.len() >= 2, "{levels:?}");
        assert!(
            (highest - lowest - 1000.0).abs() <= 100.0,
            "{lowest} to {highest}"
        );
    }

    #[test]
    fn merging_streams_share_one_final() {
        // Arrange
        let (mut fleet, advance) = fleet(Scenario::Merge, 1);
        for _ in 0..300 {
            advance(1.0);
            fleet.fly();
        }

        // Act
        let on_34l = fleet
            .states()
            .filter(|s| on_final(RWY_34L, s.x, s.y, 12.0))
            .count();

        // Assert
        assert!(on_34l >= 2, "{on_34l}");
    }

    #[test]
    fn scenario_traffic_is_the_same_for_a_seed_and_differs_between_seeds() {
        // Arrange
        let (mut same_a, advance_a) = fleet(Scenario::Parallel, 7);
        let (mut same_b, advance_b) = fleet(Scenario::Parallel, 7);
        let (mut other, advance_other) = fleet(Scenario::Parallel, 8);

        // Act
        let sent: Vec<Vec<u8>> = [
            (&mut same_a, &advance_a as &dyn Fn(f64)),
            (&mut same_b, &advance_b),
            (&mut other, &advance_other),
        ]
        .into_iter()
        .map(|(fleet, advance)| {
            advance(1.0);
            fleet.fly()
        })
        .collect();

        // Assert
        assert_eq!(sent[0], sent[1]);
        assert_ne!(sent[0], sent[2]);
    }

    #[test]
    fn scenario_names_parse() {
        // Arrange
        let names = ["merge", "parallel", "cross", "converging", "random", "loop"];

        // Act
        let parsed: Vec<Option<Scenario>> = names.iter().map(|n| n.parse().ok()).collect();

        // Assert
        assert_eq!(
            parsed,
            [
                Some(Scenario::Merge),
                Some(Scenario::Parallel),
                Some(Scenario::Cross),
                Some(Scenario::Converging),
                Some(Scenario::Random),
                None
            ]
        );
    }

    #[test]
    fn a_runway_tells_where_a_point_is_on_its_approach() {
        // Arrange
        let runway = Runway {
            x: 0.0,
            y: 0.0,
            bearing_deg: 0.0,
        };

        // Act
        let (along, right) = runway.relative(1.0, -5.0);
        let out = runway.on_final(5.0);

        // Assert
        assert!(
            (along + 5.0).abs() < 1e-9 && (right - 1.0).abs() < 1e-9,
            "{along} {right}"
        );
        assert!(out.0.abs() < 1e-9 && (out.1 + 5.0).abs() < 1e-9, "{out:?}");
    }

    #[test]
    fn background_fills_the_range_and_extra_adds_to_it() {
        // Arrange
        let (plain, _) = fleet(Scenario::Parallel, 1);
        let (more, _) = fleet_with(Scenario::Parallel, 1, 10);
        let within = |f: &Fleet| {
            f.states()
                .filter(|s| s.x.hypot(s.y) <= 1.5 * Scenario::Parallel.range_nm())
                .count()
        };

        // Act
        let counts = [plain.states().count(), more.states().count()];
        let near = [within(&plain), within(&more)];

        // Assert
        assert_eq!(counts[1], counts[0] + 10);
        assert_eq!(near[1], near[0] + 10, "{near:?}");
    }

    #[test]
    fn departures_climb_out_of_34r_and_05() {
        // Arrange
        let (mut fleet, advance) = fleet(Scenario::Parallel, 1);
        let climbing = |runway: Runway, s: &State| {
            let (along, right) = runway.relative(s.x, s.y);
            along > 0.5 && along < 4.0 && right.abs() < 0.3 && s.alt_ft < 3000.0
        };
        let mut seen = [false, false];

        // Act
        for _ in 0..300 {
            advance(1.0);
            fleet.fly();
            for (k, runway) in [RWY_34R, RWY_05].into_iter().enumerate() {
                if fleet.states().any(|s| climbing(runway, &s)) {
                    seen[k] = true;
                }
            }
        }

        // Assert
        assert_eq!(seen, [true, true]);
    }

    #[test]
    fn a_departure_off_05_crosses_the_34r_final_just_past_its_threshold() {
        // Arrange
        let streams = Scenario::Cross.streams(&mut mulberry32(1));
        let off_05 = streams
            .iter()
            .find(|s| (s.route[0].x - RWY_05.x).abs() < 1e-9)
            .expect("a stream off 05");
        let climb = (
            (off_05.route[0].x, off_05.route[0].y),
            (off_05.route[1].x, off_05.route[1].y),
        );
        let final_34r = (RWY_34R.on_final(3.0), (RWY_34R.x, RWY_34R.y));

        // Act
        let at = crossing(climb, final_34r).expect("they cross");

        // Assert
        let (along, _) = RWY_34R.relative(at.0, at.1);
        assert!(along > -2.0 && along < 0.0, "{along}");
    }

    #[test]
    fn random_is_only_background() {
        // Arrange
        let (fleet, _) = fleet(Scenario::Random, 1);

        // Act
        let count = fleet.states().count();

        // Assert
        let nominal = Scenario::Random.background() as usize;
        assert!(
            count >= nominal * 6 / 10 && count <= nominal * 14 / 10,
            "{count}"
        );
        assert!(Scenario::Random.streams(&mut mulberry32(1)).is_empty());
    }

    #[test]
    fn converging_streams_join_their_own_finals_without_crossing() {
        // Arrange
        let streams = Scenario::Converging.streams(&mut mulberry32(1));
        let leg = |n: usize| {
            (
                (streams[n].route[0].x, streams[n].route[0].y),
                (streams[n].route[1].x, streams[n].route[1].y),
            )
        };
        let (mut fleet, advance) = fleet(Scenario::Converging, 1);
        for _ in 0..300 {
            advance(1.0);
            fleet.fly();
        }

        // Act
        let crossed = crossing(leg(0), leg(1));
        let landing =
            [RWY_22, RWY_23].map(|runway| fleet.states().any(|s| on_final(runway, s.x, s.y, 8.0)));

        // Assert
        assert_eq!(crossed, None);
        assert_eq!(landing, [true, true]);
    }

    #[test]
    fn departures_climb_out_of_16l_and_16r_in_the_south_wind() {
        // Arrange
        let (mut fleet, advance) = fleet(Scenario::Converging, 1);
        let climbing = |runway: Runway, s: &State| {
            let (along, right) = runway.relative(s.x, s.y);
            along > 0.5 && along < 4.0 && right.abs() < 0.3 && s.alt_ft < 3000.0
        };
        let mut seen = [false, false];

        // Act
        for _ in 0..300 {
            advance(1.0);
            fleet.fly();
            for (k, runway) in [RWY_16L, RWY_16R].into_iter().enumerate() {
                if fleet.states().any(|s| climbing(runway, &s)) {
                    seen[k] = true;
                }
            }
        }

        // Assert
        assert_eq!(seen, [true, true]);
    }

    #[test]
    fn seeds_fly_different_spacings_and_joins() {
        // Arrange
        let seeds = [1, 2];

        // Act
        let first: Vec<(f64, f64)> = seeds
            .map(|seed| {
                let s = Scenario::Parallel.streams(&mut mulberry32(seed));
                (s[0].interval_s, s[0].route[1].y)
            })
            .to_vec();

        // Assert
        assert!((first[0].0 - first[1].0).abs() > 1e-9, "{first:?}");
        assert!((first[0].1 - first[1].1).abs() > 1e-9, "{first:?}");
    }
}
