//! How a layout scores: the scoring energy, and counts of what a layout should avoid.

use crate::cost::{Scene, Tables, build_tables, evaluate};
use crate::geometry::DIRECTIONS;
use crate::hyper::{HYPER, Term};

#[derive(Debug)]
pub struct Metrics {
    pub energy: f64,
    /// Pairs of blocks that overlap.
    pub overlaps: usize,
    /// Pairs of leaders that cross.
    pub crossings: usize,
    /// Pairs with a leader through the other's block.
    pub through: usize,
    /// Blocks whose leader could be read as another track's.
    pub ambiguous: usize,
    /// Blocks over a predicted path, their own or another's.
    pub paths_covered: usize,
    /// In-trail pairs with blocks on opposite sides of their stream.
    pub side_mismatches: usize,
}

/// Pairs whose table charges the assignment.
fn pairs_charged(t: &Tables, dirs: &[usize]) -> usize {
    t.pairs
        .iter()
        .filter(|p| p.cost[dirs[p.i] * DIRECTIONS + dirs[p.j]] > 0.0)
        .count()
}

/// Tracks whose unary cost at the assignment reaches `at_least`.
fn tracks_charged(t: &Tables, dirs: &[usize], at_least: f64) -> usize {
    dirs.iter()
        .enumerate()
        .filter(|&(i, &c)| t.unary[i * DIRECTIONS + c] >= at_least)
        .count()
}

/// The scoring of a layout of `scene`, the blocks at `dirs`.
#[must_use]
pub fn score(scene: &Scene, dirs: &[usize]) -> Metrics {
    let w = &HYPER.scoring.weights;
    let term = |terms: &[Term]| build_tables(scene, &HYPER.scoring.only(terms));
    Metrics {
        energy: evaluate(&build_tables(scene, &HYPER.scoring), dirs),
        overlaps: pairs_charged(&term(&[Term::Overlap]), dirs),
        crossings: pairs_charged(&term(&[Term::LeaderCross]), dirs),
        through: pairs_charged(&term(&[Term::LeaderThrough]), dirs),
        ambiguous: tracks_charged(&term(&[Term::Ambiguity]), dirs, 0.5 * w.ambiguity),
        paths_covered: tracks_charged(
            &term(&[Term::OwnPath, Term::ForeignPath]),
            dirs,
            w.own_path.min(w.foreign_path),
        ),
        side_mismatches: pairs_charged(&term(&[Term::FlowSide]), dirs),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cost::Subject;
    use crate::geometry::{NE, NW, SW};

    fn subject(cx: f64, cy: f64) -> Subject {
        Subject {
            cx,
            cy,
            ..Subject::default()
        }
    }

    fn scene(subjects: Vec<Subject>) -> Scene {
        Scene {
            subjects,
            px_per_nm: 10.0,
        }
    }

    #[test]
    fn counts_what_a_layout_should_avoid_with_the_scoring_energy() {
        // Arrange
        let kt150 = 150.0 * 10.0 / 3600.0;
        let subjects = vec![
            Subject {
                vx: 10.0,
                ..subject(0.0, 0.0)
            }, // its own path runs east, under an east block
            subject(0.0, 10.0), // its north-east block overlaps a's
            Subject {
                vx: kt150,
                altitude_ft: 3000.0,
                ..subject(300.0, 0.0)
            },
            Subject {
                vx: kt150,
                altitude_ft: 3000.0,
                ..subject(330.0, 0.0)
            }, // in trail with c
        ];
        let dirs = [NE, NE, NW, SW];

        // Act
        let m = score(&scene(subjects), &dirs);

        // Assert
        assert!(m.energy > 0.0);
        assert_eq!(
            (m.overlaps, m.side_mismatches, m.paths_covered, m.crossings),
            (1, 1, 0, 0)
        );
    }

    #[test]
    fn counts_a_block_over_a_predicted_path_and_an_ambiguous_leader() {
        // Arrange
        let subjects = vec![
            Subject {
                vx: 10.0,
                ..subject(0.0, 0.0)
            },
            subject(10.0, -10.0),
        ];
        let dirs = [0, SW];

        // Act
        let m = score(&scene(subjects), &dirs);

        // Assert
        assert_eq!(m.paths_covered, 1);
        assert!(m.ambiguous >= 1);
    }
}
