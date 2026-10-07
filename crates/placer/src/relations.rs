//! What the tracks are to each other: in trail, converging, turning.

use std::collections::HashMap;

use crate::cost::Subject;
use crate::geometry::{DIRECTIONS, Vec2, angle_deg, unit};

/// An in-trail link: the aircraft ahead on nearly the same heading, in trail and level.
const TRAIL_HEADING_DEG: f64 = 25.0;
const TRAIL_MIN_NM: f64 = 1.5;
const TRAIL_MAX_NM: f64 = 10.0;
const TRAIL_CROSS_NM: f64 = 0.7;
const TRAIL_LEVEL_FT: f64 = 6000.0;
/// A converging pair: closing to within a few miles within a few minutes, whatever the levels.
const CONVERGING_MIN_SEC: f64 = 5.0;
const CONVERGING_MAX_SEC: f64 = 240.0;
const CONVERGING_RANGE_NM: f64 = 30.0;
const CONVERGING_MISS_NM: f64 = 5.0;
const TURNING_DEG_PER_SEC: f64 = 1.0;
/// How far off the heading axis a block is before it counts as beside the aircraft.
const SIDE: f64 = 0.3;

#[derive(Debug)]
pub struct Converging {
    pub i: usize,
    pub j: usize,
    /// 0 to 1, higher the sooner and closer the pair meets.
    pub urgency: f64,
}

#[derive(Debug)]
pub struct Relations {
    /// Per track, the one it follows in trail.
    pub leader: Vec<Option<usize>>,
    /// Tracks linked in trail, as index lists of two or more.
    pub chains: Vec<Vec<usize>>,
    pub converging: Vec<Converging>,
    pub turning: Vec<bool>,
}

/// Unit vector of a track's heading on screen, or none while it does not move.
#[must_use]
pub fn heading(s: &Subject) -> Option<Vec2> {
    let v = Vec2::new(s.vx, s.vy);
    let n = v.len();
    (n > 0.0).then(|| v * (1.0 / n))
}

/// The nearest aircraft ahead of `i` that it is in trail with.
fn leader_of(i: usize, subjects: &[Subject], px_per_nm: f64) -> Option<usize> {
    let a = &subjects[i];
    let h = heading(a)?;
    let mut best = None;
    let mut nearest = f64::INFINITY;
    for (j, b) in subjects.iter().enumerate() {
        if j == i {
            continue;
        }
        let Some(hb) = heading(b) else { continue };
        if angle_deg(h, hb) > TRAIL_HEADING_DEG {
            continue;
        }
        let d = Vec2::new((b.cx - a.cx) / px_per_nm, (b.cy - a.cy) / px_per_nm);
        let along = d.dot(h);
        let cross = d.cross(h).abs();
        if !(TRAIL_MIN_NM..=TRAIL_MAX_NM).contains(&along) || cross >= TRAIL_CROSS_NM {
            continue;
        }
        let level = (a.altitude_ft - b.altitude_ft).abs();
        if level.is_nan() || level >= TRAIL_LEVEL_FT {
            continue;
        }
        if along < nearest {
            nearest = along;
            best = Some(j);
        }
    }
    best
}

fn find(root: &[usize], i: usize) -> usize {
    let mut r = i;
    while root[r] != r {
        r = root[r];
    }
    r
}

/// The connected components of the links, those with two or more members.
fn chains_of(leader: &[Option<usize>]) -> Vec<Vec<usize>> {
    let mut root: Vec<usize> = (0..leader.len()).collect();
    for (i, l) in leader.iter().enumerate() {
        if let Some(l) = l {
            let (ri, rl) = (find(&root, i), find(&root, *l));
            root[ri] = rl;
        }
    }
    let mut groups: Vec<Vec<usize>> = Vec::new();
    let mut at: HashMap<usize, usize> = HashMap::new();
    for i in 0..leader.len() {
        let r = find(&root, i);
        let k = *at.entry(r).or_insert_with(|| {
            groups.push(Vec::new());
            groups.len() - 1
        });
        groups[k].push(i);
    }
    groups.into_iter().filter(|g| g.len() >= 2).collect()
}

fn converging_pairs(
    subjects: &[Subject],
    leader: &[Option<usize>],
    px_per_nm: f64,
) -> Vec<Converging> {
    let mut out = Vec::new();
    for (i, a) in subjects.iter().enumerate() {
        for (j, b) in subjects.iter().enumerate().skip(i + 1) {
            if leader[i] == Some(j) || leader[j] == Some(i) {
                continue;
            }
            let r = Vec2::new((b.cx - a.cx) / px_per_nm, (b.cy - a.cy) / px_per_nm);
            let w = Vec2::new((b.vx - a.vx) / px_per_nm, (b.vy - a.vy) / px_per_nm);
            let w2 = w.dot(w);
            if w2 == 0.0 {
                continue;
            }
            let tc = -r.dot(w) / w2;
            if !(CONVERGING_MIN_SEC..=CONVERGING_MAX_SEC).contains(&tc)
                || r.len() > CONVERGING_RANGE_NM
            {
                continue;
            }
            let miss = (r + w * tc).len();
            if miss > CONVERGING_MISS_NM {
                continue;
            }
            let urgency = (1.0 - tc / CONVERGING_MAX_SEC) * (1.0 - miss / CONVERGING_MISS_NM);
            out.push(Converging { i, j, urgency });
        }
    }
    out
}

/// What the tracks are to each other, from their state; `px_per_nm` turns their px into miles.
#[must_use]
pub fn relations(subjects: &[Subject], px_per_nm: f64) -> Relations {
    let leader: Vec<Option<usize>> = (0..subjects.len())
        .map(|i| leader_of(i, subjects, px_per_nm))
        .collect();
    Relations {
        chains: chains_of(&leader),
        converging: converging_pairs(subjects, &leader, px_per_nm),
        turning: subjects
            .iter()
            .map(|s| s.turn_rate_deg_per_sec.abs() > TURNING_DEG_PER_SEC)
            .collect(),
        leader,
    }
}

/// Which side of heading `h` a block at `dir` sits: 1 right, -1 left, 0 ahead or behind.
#[must_use]
pub fn side(h: Vec2, dir: usize) -> i8 {
    let s = h.cross(unit(dir));
    if s > SIDE {
        1
    } else if s < -SIDE {
        -1
    } else {
        0
    }
}

/// The direction nearest the reflection of `dir` across heading `h`, to swap a block's side.
#[must_use]
pub fn mirror(h: Vec2, dir: usize) -> usize {
    let u = unit(dir);
    let m = h * (2.0 * u.dot(h)) - u;
    let mut best = dir;
    let mut closest = f64::NEG_INFINITY;
    for d in 0..DIRECTIONS {
        let dot = unit(d).dot(m);
        if dot > closest {
            closest = dot;
            best = d;
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry::{E, N, NE, S, SE};

    /// The scale the fixtures are laid out at, so 10 px is a mile.
    const PX_PER_NM: f64 = 10.0;
    /// 150 kt eastbound at that scale, px per second.
    const KT150: f64 = 150.0 * PX_PER_NM / 3600.0;

    fn subject(cx: f64, cy: f64) -> Subject {
        Subject {
            cx,
            cy,
            vx: KT150,
            altitude_ft: 3000.0,
            ..Subject::default()
        }
    }

    #[test]
    fn links_a_follower_to_the_nearest_aircraft_ahead_on_the_same_heading_and_level() {
        // Arrange
        let subjects = [subject(0.0, 0.0), subject(30.0, 0.0), subject(70.0, 0.0)];

        // Act
        let Relations { leader, .. } = relations(&subjects, PX_PER_NM);

        // Assert
        assert_eq!(leader, [Some(1), Some(2), None]);
    }

    #[test]
    fn does_not_link_parallel_finals_a_mile_and_a_half_apart() {
        // Arrange
        let subjects = [subject(0.0, 0.0), subject(30.0, 15.0)];

        // Act
        let Relations { leader, chains, .. } = relations(&subjects, PX_PER_NM);

        // Assert
        assert_eq!(leader, [None, None]);
        assert!(chains.is_empty());
    }

    #[test]
    fn does_not_link_aircraft_too_close_too_far_on_other_headings_or_at_other_levels() {
        // Arrange
        let subjects = [
            subject(0.0, 0.0),
            subject(10.0, 0.0),
            subject(120.0, 0.0),
            Subject {
                vx: 0.0,
                vy: KT150,
                ..subject(40.0, 0.0)
            },
            Subject {
                altitude_ft: 10000.0,
                ..subject(60.0, 0.0)
            },
        ];

        // Act
        let Relations { leader, .. } = relations(&subjects, PX_PER_NM);

        // Assert
        assert_eq!(leader[0], None);
    }

    #[test]
    fn gathers_linked_aircraft_into_chains_of_two_or_more() {
        // Arrange
        let subjects = [
            subject(0.0, 0.0),
            subject(30.0, 0.0),
            subject(60.0, 0.0),
            subject(0.0, 200.0),
        ];

        // Act
        let Relations { mut chains, .. } = relations(&subjects, PX_PER_NM);

        // Assert
        for c in &mut chains {
            c.sort_unstable();
        }
        assert_eq!(chains, vec![vec![0, 1, 2]]);
    }

    #[test]
    fn keeps_a_pair_that_closes_to_a_miss_within_a_few_minutes_with_its_urgency() {
        // Arrange
        let a = Subject {
            vx: 1.0,
            vy: 0.0,
            ..subject(0.0, 0.0)
        };
        let b = Subject {
            vx: 0.0,
            vy: 1.0,
            ..subject(120.0, -120.0)
        };

        // Act
        let Relations { converging, .. } = relations(&[a, b], PX_PER_NM);

        // Assert
        assert_eq!(converging.len(), 1);
        assert_eq!((converging[0].i, converging[0].j), (0, 1));
        assert!((converging[0].urgency - 0.5).abs() < 0.01);
    }

    #[test]
    fn drops_a_pair_that_is_moving_apart() {
        // Arrange
        let a = Subject {
            vx: 1.0,
            vy: 0.0,
            ..subject(0.0, 0.0)
        };
        let b = Subject {
            vx: 0.0,
            vy: -1.0,
            ..subject(120.0, -120.0)
        };

        // Act
        let Relations { converging, .. } = relations(&[a, b], PX_PER_NM);

        // Assert
        assert!(converging.is_empty());
    }

    #[test]
    fn does_not_count_a_linked_pair_as_converging() {
        // Arrange
        let subjects = [
            subject(0.0, 0.0),
            Subject {
                vx: KT150 * 0.9,
                ..subject(30.0, 0.0)
            },
        ];

        // Act
        let Relations {
            leader, converging, ..
        } = relations(&subjects, PX_PER_NM);

        // Assert
        assert_eq!(leader[0], Some(1));
        assert!(converging.is_empty());
    }

    #[test]
    fn turning_is_a_turn_rate_above_a_degree_a_second() {
        // Arrange
        let subjects = [
            Subject {
                turn_rate_deg_per_sec: 0.5,
                ..subject(0.0, 0.0)
            },
            Subject {
                turn_rate_deg_per_sec: 1.5,
                ..subject(0.0, 100.0)
            },
        ];

        // Act
        let Relations { turning, .. } = relations(&subjects, PX_PER_NM);

        // Assert
        assert_eq!(turning, [false, true]);
    }

    #[test]
    fn turning_counts_a_left_turn_as_much_as_a_right_one() {
        // Arrange
        let subjects = [Subject {
            turn_rate_deg_per_sec: -3.0,
            ..subject(0.0, 0.0)
        }];

        // Act
        let Relations { turning, .. } = relations(&subjects, PX_PER_NM);

        // Assert
        assert_eq!(turning, [true]);
    }

    #[test]
    fn side_is_right_left_or_neither_of_the_heading_on_screen() {
        // Arrange
        let east = Vec2::new(1.0, 0.0);

        // Act
        let sides: Vec<i8> = [S, N, E, SE].iter().map(|&d| side(east, d)).collect();

        // Assert
        assert_eq!(sides, [1, -1, 0, 1]);
    }

    #[test]
    fn mirror_is_the_direction_across_the_heading_axis() {
        // Arrange
        let east = Vec2::new(1.0, 0.0);

        // Act
        let mirrored: Vec<usize> = [NE, SE, E, N].iter().map(|&d| mirror(east, d)).collect();

        // Assert
        assert_eq!(mirrored, [SE, NE, E, S]);
    }
}
