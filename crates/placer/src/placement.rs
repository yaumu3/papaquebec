//! The placer: where every block goes, from where it sits.

use crate::anneal::{Budget, anneal};
use crate::cost::{Scene, build_tables};
use crate::geometry::DIRECTIONS;
use crate::hyper::Hyperparams;

/// The cheapest direction for a track on its own account.
fn cheapest(unary: &[f64], i: usize) -> usize {
    (0..DIRECTIONS)
        .min_by(|&a, &b| unary[i * DIRECTIONS + a].total_cmp(&unary[i * DIRECTIONS + b]))
        .unwrap_or(0)
}

/// The bearing of every block: from where each sits, or the cheapest for a new one, annealed
/// over the cost tables so blocks keep clear of each other, of glyphs and of predicted paths,
/// and move only when the move is worth it.
pub fn place_blocks<R: FnMut() -> f64, C: FnMut() -> f64>(
    scene: &Scene,
    rng: R,
    now: C,
    hyper: &Hyperparams,
) -> Vec<usize> {
    let tables = build_tables(scene, &hyper.energy);
    let start: Vec<usize> = scene
        .subjects
        .iter()
        .enumerate()
        .map(|(i, s)| s.dir.unwrap_or_else(|| cheapest(&tables.unary, i)))
        .collect();
    anneal(
        &tables,
        &start,
        Budget {
            ms: hyper.budget_ms,
            now,
        },
        rng,
        hyper,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cost::Subject;
    use crate::geometry::{NE, NW, SW, block_rect, overlap};
    use crate::hyper::{Energy, HYPER, Term};
    use crate::rng::mulberry32;

    /// A clock that advances a tenth of a millisecond each time it is read.
    fn ticking() -> impl FnMut() -> f64 {
        let mut t = 0.0;
        move || {
            t += 0.1;
            t
        }
    }

    /// Subjects at 10 px to the mile, with nothing else in the way.
    fn scene(subjects: Vec<Subject>) -> Scene {
        Scene {
            subjects,
            px_per_nm: 10.0,
        }
    }

    fn subject(cx: f64, cy: f64) -> Subject {
        Subject {
            cx,
            cy,
            ..Subject::default()
        }
    }

    #[test]
    fn keeps_an_uncontested_block_where_it_sits() {
        // Arrange
        let subjects = vec![Subject {
            dir: Some(SW),
            ..subject(0.0, 0.0)
        }];

        // Act
        let placed = place_blocks(&scene(subjects), mulberry32(1), ticking(), &HYPER);

        // Assert
        assert_eq!(placed, [SW]);
    }

    #[test]
    fn starts_a_new_block_in_the_rear_quarter_nearest_north_east() {
        // Arrange
        let subjects = vec![Subject {
            vx: 5.0,
            ..subject(0.0, 0.0)
        }]; // eastbound

        // Act
        let placed = place_blocks(&scene(subjects), mulberry32(1), ticking(), &HYPER);

        // Assert
        assert_eq!(placed, [NW]);
    }

    #[test]
    fn starts_a_still_new_block_north_east() {
        // Arrange
        let subjects = vec![subject(0.0, 0.0)];

        // Act
        let placed = place_blocks(&scene(subjects), mulberry32(1), ticking(), &HYPER);

        // Assert
        assert_eq!(placed, [NE]);
    }

    #[test]
    fn separates_two_blocks_that_would_overlap() {
        // Arrange
        let subjects = vec![
            Subject {
                dir: Some(NE),
                ..subject(0.0, 0.0)
            },
            Subject {
                dir: Some(NE),
                ..subject(0.0, 10.0)
            },
        ];
        let scene = scene(subjects);

        // Act
        let placed = place_blocks(&scene, mulberry32(1), ticking(), &HYPER);

        // Assert
        let rect = |i: usize| block_rect(scene.subjects[i].cx, scene.subjects[i].cy, placed[i], 0);
        assert!(overlap(rect(0), rect(1)).abs() < 1e-9);
    }

    #[test]
    fn searches_under_the_hyperparameters_given_as_a_tuner_would_have_it() {
        // Arrange
        let subjects = vec![Subject {
            vx: 5.0,
            ..subject(0.0, 0.0)
        }]; // eastbound: north-west by default
        let mut hyper = HYPER.clone();
        hyper.energy = Energy {
            lookahead: HYPER.energy.lookahead.clone(),
            ..HYPER.energy.only(&[Term::DefaultDir])
        };

        // Act
        let placed = place_blocks(&scene(subjects), mulberry32(1), ticking(), &hyper);

        // Assert
        assert_eq!(placed, [NE]);
    }

    #[test]
    fn is_deterministic_for_a_seed_and_a_clock() {
        // Arrange
        let subjects = vec![subject(0.0, 0.0), subject(0.0, 12.0), subject(30.0, 6.0)];
        let scene = scene(subjects);

        // Act
        let runs: Vec<Vec<usize>> = [1, 1]
            .iter()
            .map(|&seed| place_blocks(&scene, mulberry32(seed), ticking(), &HYPER))
            .collect();

        // Assert
        assert_eq!(runs[0], runs[1]);
    }
}
