//! Simulated annealing over the cost tables.

use crate::cost::{CELLS, Tables, evaluate};
use crate::geometry::DIRECTIONS;
use crate::hyper::Hyperparams;

/// How long a run may take by `now`, a clock in milliseconds read between batches.
pub struct Budget<C: FnMut() -> f64> {
    pub ms: f64,
    pub now: C,
}

/// Iterations between looks at the clock.
pub const BATCH: usize = 64;
/// Batches a run may take whatever the clock says, so a clock that stands still cannot hold it.
const MAX_BATCHES: usize = 1 << 14;

/// A pair table as one of its tracks sees it.
#[derive(Clone, Copy)]
struct Link {
    other: usize,
    pair: usize,
    /// Whether this track indexes the table's rows, else its columns.
    row: bool,
}

fn links_of(tables: &Tables, n: usize) -> Vec<Vec<Link>> {
    let mut links: Vec<Vec<Link>> = (0..n).map(|_| Vec::new()).collect();
    for (pair, p) in tables.pairs.iter().enumerate() {
        links[p.i].push(Link {
            other: p.j,
            pair,
            row: true,
        });
        links[p.j].push(Link {
            other: p.i,
            pair,
            row: false,
        });
    }
    links
}

/// The change in energy from moving track `i` to direction `c`: the difference in its own cost
/// and in every pair table it is in, with the other tracks where they are.
fn delta(tables: &Tables, links: &[Link], dirs: &[usize], i: usize, c: usize) -> f64 {
    let from = dirs[i];
    let mut d = tables.unary[i * DIRECTIONS + c] - tables.unary[i * DIRECTIONS + from];
    for l in links {
        let cost: &[f64; CELLS] = &tables.pairs[l.pair].cost;
        let o = dirs[l.other];
        d += if l.row {
            cost[c * DIRECTIONS + o] - cost[from * DIRECTIONS + o]
        } else {
            cost[o * DIRECTIONS + c] - cost[o * DIRECTIONS + from]
        };
    }
    d
}

/// A move tried on `dirs`: its change in energy, and what to put back to undo it.
struct Trial {
    d: f64,
    undo: Vec<(usize, usize)>,
}

/// One track to one other direction, chosen uniformly.
fn move_one(
    tables: &Tables,
    links: &[Vec<Link>],
    dirs: &mut [usize],
    rng: &mut impl FnMut() -> f64,
) -> Trial {
    let i = index(rng(), dirs.len());
    let from = dirs[i];
    let c = (from + 1 + index(rng(), DIRECTIONS - 1)) % DIRECTIONS;
    let d = delta(tables, &links[i], dirs, i, c);
    dirs[i] = c;
    Trial {
        d,
        undo: vec![(i, from)],
    }
}

/// Every member of one chain to the other side of its stream, one after another.
fn flip_chain(
    tables: &Tables,
    links: &[Vec<Link>],
    dirs: &mut [usize],
    rng: &mut impl FnMut() -> f64,
) -> Trial {
    let chain = &tables.chains[index(rng(), tables.chains.len())];
    let mut d = 0.0;
    let mut undo = Vec::with_capacity(chain.len());
    for &i in chain {
        let from = dirs[i];
        let c = tables.mirror[i * DIRECTIONS + from];
        d += delta(tables, &links[i], dirs, i, c);
        dirs[i] = c;
        undo.push((i, from));
    }
    Trial { d, undo }
}

/// An index below `n` from a draw in 0 to 1.
#[allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss
)]
fn index(draw: f64, n: usize) -> usize {
    ((draw * n as f64) as usize).min(n - 1)
}

/// Simulated annealing over the tables from `start`, for as long as the budget allows: each
/// step offers one track another direction, or now and then a whole chain the other side of
/// its stream, and takes it when the energy falls, or by chance while the temperature is high.
/// Returns the best assignment seen, so a run never ends worse than the start.
pub fn anneal<C: FnMut() -> f64, R: FnMut() -> f64>(
    tables: &Tables,
    start: &[usize],
    mut budget: Budget<C>,
    mut rng: R,
    hyper: &Hyperparams,
) -> Vec<usize> {
    let n = start.len();
    let mut dirs = start.to_vec();
    let mut best = start.to_vec();
    let mut energy = evaluate(tables, &dirs);
    let mut best_energy = energy;
    if n == 0 {
        return dirs;
    }
    let links = links_of(tables, n);
    let temperature = &hyper.temperature;
    let cooling = (temperature.end / temperature.start).ln();
    let began = (budget.now)();
    for _ in 0..MAX_BATCHES {
        let spent = ((budget.now)() - began) / budget.ms;
        if spent >= 1.0 {
            break;
        }
        let temp = temperature.start * (cooling * spent).exp();
        for _ in 0..BATCH {
            let flip = !tables.chains.is_empty() && rng() < hyper.chain_flip;
            let trial = if flip {
                flip_chain(tables, &links, &mut dirs, &mut rng)
            } else {
                move_one(tables, &links, &mut dirs, &mut rng)
            };
            if trial.d > 0.0 && rng() >= (-trial.d / temp).exp() {
                for (i, from) in trial.undo {
                    dirs[i] = from;
                }
                continue;
            }
            energy += trial.d;
            if energy < best_energy {
                best_energy = energy;
                best.copy_from_slice(&dirs);
            }
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cost::{Scene, Subject, build_tables, evaluate};
    use crate::geometry::{N, NE, S};
    use crate::hyper::HYPER;
    use crate::rng::mulberry32;

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
            dir: Some(NE),
            ..Subject::default()
        }
    }

    /// Five targets close enough that every north-east block collides with another.
    fn crowd() -> Tables {
        build_tables(
            &scene(vec![
                subject(0.0, 0.0),
                subject(0.0, 12.0),
                subject(30.0, 6.0),
                subject(-30.0, 18.0),
                subject(15.0, 30.0),
            ]),
            &HYPER.scoring,
        )
    }

    /// A clock that advances `step` ms each time it is read.
    fn ticking(step: f64) -> impl FnMut() -> f64 {
        let mut t = -step;
        move || {
            t += step;
            t
        }
    }

    /// A budget of `batches` batches: the clock ticks a millisecond per check.
    fn budget(batches: f64) -> Budget<impl FnMut() -> f64> {
        Budget {
            ms: batches,
            now: ticking(1.0),
        }
    }

    fn all_ne(n: usize) -> Vec<usize> {
        vec![NE; n]
    }

    #[test]
    fn never_ends_worse_than_it_started() {
        // Arrange
        let tables = crowd();
        let start = all_ne(5);
        let before = evaluate(&tables, &start);

        // Act
        let runs: Vec<f64> = (1..=3)
            .map(|seed| {
                evaluate(
                    &tables,
                    &anneal(&tables, &start, budget(8.0), mulberry32(seed), &HYPER),
                )
            })
            .collect();

        // Assert
        assert!(runs.iter().all(|&e| e <= before));
    }

    #[test]
    fn is_deterministic_for_a_seed_and_a_clock() {
        // Arrange
        let tables = crowd();

        // Act
        let runs: Vec<Vec<usize>> = [1, 1]
            .iter()
            .map(|&seed| anneal(&tables, &all_ne(5), budget(30.0), mulberry32(seed), &HYPER))
            .collect();

        // Assert
        assert_eq!(runs[0], runs[1]);
    }

    #[test]
    fn separates_two_blocks_that_overlap_at_the_start() {
        // Arrange
        let tables = build_tables(
            &scene(vec![subject(0.0, 0.0), subject(0.0, 10.0)]),
            &HYPER.scoring,
        );

        // Act
        let dirs = anneal(&tables, &all_ne(2), budget(30.0), mulberry32(1), &HYPER);

        // Assert
        assert!(tables.pairs[0].cost[dirs[0] * 8 + dirs[1]].abs() < 1e-9);
    }

    #[test]
    fn returns_the_start_untouched_when_the_budget_is_spent_before_the_first_batch() {
        // Arrange
        let tables = crowd();
        let spent = Budget {
            ms: 2.0,
            now: ticking(5.0),
        };

        // Act
        let dirs = anneal(&tables, &all_ne(5), spent, mulberry32(1), &HYPER);

        // Assert
        assert_eq!(dirs, all_ne(5));
    }

    #[test]
    fn returns_after_a_bounded_number_of_batches_when_the_clock_stands_still() {
        // Arrange
        let tables = crowd();
        let stalled = Budget {
            ms: 2.0,
            now: || 0.0,
        };

        // Act
        let dirs = anneal(&tables, &all_ne(5), stalled, mulberry32(1), &HYPER);

        // Assert
        assert_eq!(dirs.len(), 5);
    }

    #[test]
    fn flips_a_whole_chain_to_the_other_side_of_its_stream_as_one_move() {
        // Arrange
        let in_trail = |cx| Subject {
            vx: 150.0 * 10.0 / 3600.0,
            altitude_ft: 3000.0,
            dir: Some(N),
            ..subject(cx, 0.0)
        };
        let glyph = |cx| subject(cx, -40.0);
        let subjects = vec![
            in_trail(0.0),
            in_trail(30.0),
            in_trail(60.0),
            glyph(40.0),
            glyph(70.0),
            glyph(100.0),
        ];
        let tables = build_tables(&scene(subjects), &HYPER.scoring);
        let flip_first = || 0.0;

        // Act
        let dirs = anneal(
            &tables,
            &[N, N, N, NE, NE, NE],
            Budget {
                ms: 2.0,
                now: ticking(1.0),
            },
            flip_first,
            &HYPER,
        );

        // Assert
        assert_eq!(&dirs[..3], [S, S, S]);
    }
}
