//! Scores the data block placer on the sim's scenarios: the annealer against the greedy
//! baseline, on fixed seeds, by the scoring energy and the counts of what a layout should
//! avoid, with block moves a minute and, on the parallel finals, the share of blocks on the
//! outer side.
//!
//!   bench [--seconds 180] [--seeds 1,2,3,4,5,6] [--scenarios merge,cross] [--extra 0] [--check]
//!
//! Each seed flies different traffic on a different canvas and zoom, and every run goes on a
//! thread of its own. `--extra` adds that many background aircraft to every scenario. `--check`
//! fails unless the annealer beats the baseline on energy, overlaps, paths covered, ambiguous
//! leaders and, on the parallel finals, the share of blocks on the outer side, and stays within
//! tolerance of the energies committed in `hyperparams.json`.

use std::collections::HashMap;
use std::env;
use std::process::ExitCode;
use std::sync::{Arc, Mutex};
use std::thread;

use feeder::position::Position;
use placer::BATCH;
use placer::cost::{Scene, Subject};
use placer::geometry::{DB_HEIGHT, Vec2, block_rect};
use placer::greedy::place_greedy;
use placer::hyper::HYPER;
use placer::placement::place_blocks;
use placer::rng::mulberry32;
use placer::score::{Metrics, score};
use sim::{Fleet, Runway, Scenario, State};

/// RJTT
const SITE: Position = Position {
    lat_deg: 35.5533,
    lon_deg: 139.7811,
};
/// The canvases a layout is judged on, CSS px: a desktop window and a phone, by turns of the seed.
const CANVASES: [(f64, f64); 2] = [(1600.0, 1000.0), (390.0, 760.0)];
/// Zooms round the scenario's own range, by turns of the seed: the same traffic at three scales.
const ZOOMS: [f64; 3] = [1.0, 0.75, 1.5];
/// How far beyond the canvas a target can be and still have a block on it, as the scope has it.
const REACH_PX: f64 = 120.0;
const HISTORY_SEC: f64 = 30.0;
/// The scope's scale: the range ring fills this much of the canvas's short edge.
const RANGE_FILL: f64 = 0.92;
/// Annealing steps the scope's worker manages a millisecond: 15,000 to 22,000 measured on the
/// scenarios on an M-series Mac, WebAssembly and native alike, halved for a phone.
const STEPS_PER_MS: f64 = 10_000.0;
/// A layout's score as the benchmark prints it, in the order of `columns`.
const COLUMNS: [&str; 7] = [
    "energy",
    "overlaps",
    "crossings",
    "through",
    "ambiguous",
    "paths",
    "side",
];
/// The columns `--check` holds the annealer to, no worse than the baseline.
const CHECKED: [&str; 4] = ["energy", "overlaps", "paths", "ambiguous"];
/// How far the energy may drift from the committed score before `--check` objects.
const TOLERANCE: f64 = 0.15;

fn px_per_nm_for(width: f64, height: f64, range_nm: f64) -> f64 {
    width.min(height) / 2.0 * RANGE_FILL / range_nm
}

#[allow(clippy::cast_precision_loss)]
fn count(n: usize) -> f64 {
    n as f64
}

fn columns(m: &Metrics) -> [f64; 7] {
    [
        m.energy,
        count(m.overlaps),
        count(m.crossings),
        count(m.through),
        count(m.ambiguous),
        count(m.paths_covered),
        count(m.side_mismatches),
    ]
}

fn column(name: &str) -> usize {
    COLUMNS.iter().position(|c| *c == name).expect("a column")
}

/// One of a table, by turns of the seed.
fn by_seed<T: Copy>(table: &[T], seed: u32) -> T {
    table[usize::try_from(seed).unwrap_or(0) % table.len()]
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Placer {
    Annealed,
    Greedy,
}

impl Placer {
    const ALL: [Self; 2] = [Self::Annealed, Self::Greedy];

    fn name(self) -> &'static str {
        match self {
            Self::Annealed => "annealed",
            Self::Greedy => "greedy",
        }
    }
}

/// A run's sums over its frames.
#[derive(Default)]
struct Totals {
    metrics: [f64; 7],
    frames: usize,
    moves: usize,
    /// Blocks on the established parallel finals: on the outer side, and all.
    outer: usize,
    on_final: usize,
}

struct Job {
    scenario: Scenario,
    seed: u32,
    placer: Placer,
}

/// The runway whose final a track is established on, inside 12 NM, by index.
fn final_of(s: &Subject, k: f64, runways: &[Runway]) -> Option<usize> {
    runways.iter().position(|rw| {
        let (along, right) = rw.relative(s.cx / k, -s.cy / k);
        right.abs() < 0.2 && along > -12.0 && along < 0.0
    })
}

/// Whether a block at `dir` lies on the outer side of the pair: left of the left runway's
/// course, right of the right's.
fn on_outer_side(s: &Subject, dir: usize, k: f64, rw: Runway, left: bool) -> bool {
    let c = block_rect(s.cx, s.cy, dir, s.extra_lines).centre();
    let centre = rw.relative(c.x / k, -c.y / k).1;
    let track = rw.relative(s.cx / k, -s.cy / k).1;
    if left { centre < track } else { centre > track }
}

/// What the placer sees of the aircraft shown, carrying each block's state and history on.
fn subjects_of(
    shown: &[State],
    k: f64,
    t: f64,
    state: &HashMap<u32, (usize, f64)>,
    fixes: &mut HashMap<u32, Vec<(f64, f64, f64)>>,
) -> Vec<Subject> {
    shown
        .iter()
        .map(|a| {
            let (cx, cy) = (a.x * k, -a.y * k);
            let past = fixes.entry(a.address).or_default();
            past.push((t, cx, cy));
            past.retain(|p| p.0 >= t - HISTORY_SEC);
            let was = state.get(&a.address);
            let rad = a.track_deg.to_radians();
            Subject {
                cx,
                cy,
                vx: a.gs_kt * rad.sin() * k / 3600.0,
                vy: -a.gs_kt * rad.cos() * k / 3600.0,
                extra_lines: 0,
                dir: was.map(|w| w.0),
                since_move: was.map_or(f64::INFINITY, |w| t - w.1),
                manual: false,
                altitude_ft: a.alt_ft,
                turn_rate_deg_per_sec: a.turn_deg_per_s,
                history: past.iter().rev().map(|p| Vec2::new(p.1, p.2)).collect(),
            }
        })
        .collect()
}

/// Flies the scenario through a placer, carrying the state as the scope would, and scores each
/// frame with the scoring energy. The search is the same every run: the placer's clock ticks
/// as long as a batch of steps takes the worker, and its draws come from the seed.
fn fly(job: &Job, seconds: u32, extra: u32) -> Totals {
    let (width, height) = by_seed(&CANVASES, job.seed);
    let k = px_per_nm_for(
        width,
        height,
        job.scenario.range_nm() * by_seed(&ZOOMS, job.seed),
    );
    let on_canvas = |cx: f64, cy: f64| {
        cx.abs() <= width / 2.0 + REACH_PX && cy.abs() <= height / 2.0 + REACH_PX
    };
    // The outer side is judged only where the finals leave room for a block and a half between
    // them, which is the approach zoom; wider, there is no inner side to speak of.
    let runways = job.scenario.runways();
    let apart = match runways.as_slice() {
        [left, right, ..] => left.relative(right.x, right.y).1.abs() * k,
        _ => 0.0,
    };
    let judge_sides = job.scenario == Scenario::Parallel && apart >= 1.5 * DB_HEIGHT;
    let clock = Arc::new(Mutex::new(0.0));
    let hand = Arc::clone(&clock);
    let mut fleet = Fleet::scenario(
        SITE,
        move || *clock.lock().expect("clock"),
        job.scenario,
        job.seed,
        extra,
    );
    let mut state: HashMap<u32, (usize, f64)> = HashMap::new();
    let mut fixes: HashMap<u32, Vec<(f64, f64, f64)>> = HashMap::new();
    let mut rng = mulberry32(job.seed);
    let mut tick = 0.0;
    let mut now = move || {
        tick += count(BATCH) / STEPS_PER_MS;
        tick
    };
    let mut totals = Totals::default();
    for second in 1..=seconds {
        *hand.lock().expect("clock") += 1.0;
        fleet.fly();
        let t = f64::from(second);
        let shown: Vec<State> = fleet
            .states()
            .filter(|s| on_canvas(s.x * k, -s.y * k))
            .collect();
        let scene = Scene {
            subjects: subjects_of(&shown, k, t, &state, &mut fixes),
            px_per_nm: k,
        };
        let dirs = match job.placer {
            Placer::Annealed => place_blocks(&scene, &mut rng, &mut now, &HYPER),
            Placer::Greedy => place_greedy(&scene),
        };
        for (i, s) in scene.subjects.iter().enumerate() {
            let address = shown[i].address;
            let dir = dirs[i];
            let moved_at = match state.get(&address).copied() {
                Some((d, at)) if d == dir => at,
                Some(_) => {
                    totals.moves += 1;
                    t
                }
                None => t,
            };
            state.insert(address, (dir, moved_at));
            if judge_sides && let Some(index) = final_of(s, k, &runways) {
                totals.on_final += 1;
                if on_outer_side(s, dir, k, runways[index], index == 0) {
                    totals.outer += 1;
                }
            }
        }
        for (sum, value) in totals
            .metrics
            .iter_mut()
            .zip(columns(&score(&scene, &dirs)))
        {
            *sum += value;
        }
        totals.frames += 1;
    }
    totals
}

/// Means per frame over the runs.
struct Report {
    metrics: [f64; 7],
    moves_per_min: f64,
    /// Share of blocks on the outer side of the parallel finals; none elsewhere.
    outer: Option<f64>,
}

fn report(runs: &[&Totals]) -> Report {
    let frames = count(runs.iter().map(|r| r.frames).sum());
    let on_final: usize = runs.iter().map(|r| r.on_final).sum();
    Report {
        metrics: std::array::from_fn(|c| runs.iter().map(|r| r.metrics[c]).sum::<f64>() / frames),
        moves_per_min: count(runs.iter().map(|r| r.moves).sum()) / frames * 60.0,
        outer: (on_final > 0).then(|| count(runs.iter().map(|r| r.outer).sum()) / count(on_final)),
    }
}

/// What `--check` objects to in a scenario's reports, if anything.
fn complaints_of(name: &str, annealed: &Report, greedy: &Report, extra: u32) -> Vec<String> {
    let mut out = Vec::new();
    for key in CHECKED {
        let c = column(key);
        if annealed.metrics[c] > greedy.metrics[c] {
            out.push(format!("{name}: annealed {key} above greedy"));
        }
    }
    if let (Some(a), Some(g)) = (annealed.outer, greedy.outer)
        && a < g
    {
        out.push(format!("{name}: annealed outer below greedy"));
    }
    let committed = if extra == 0 {
        HYPER.meta.bench.get(name)
    } else {
        None
    };
    let energy = annealed.metrics[column("energy")];
    if let Some(&committed) = committed
        && (energy - committed).abs() > TOLERANCE * committed
    {
        out.push(format!(
            "{name}: energy {energy:.0} drifted from {committed}"
        ));
    }
    out
}

/// The value after a `--flag`, or the default.
fn option<T: std::str::FromStr>(args: &[String], flag: &str, default: T) -> T {
    args.iter()
        .position(|a| a == flag)
        .and_then(|i| args.get(i + 1))
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

fn main() -> ExitCode {
    let args: Vec<String> = env::args().skip(1).collect();
    let seconds: u32 = option(&args, "--seconds", 180);
    let extra: u32 = option(&args, "--extra", 0);
    let check = args.iter().any(|a| a == "--check");
    let seeds: Vec<u32> = option(&args, "--seeds", "1,2,3,4,5,6".to_string())
        .split(',')
        .filter_map(|s| s.parse().ok())
        .collect();
    let names: Vec<&str> = Scenario::ALL.iter().map(|s| s.name()).collect();
    let chosen = option(&args, "--scenarios", names.join(","));
    let chosen: Vec<Scenario> = Scenario::ALL
        .into_iter()
        .filter(|s| chosen.split(',').any(|c| c == s.name()))
        .collect();
    let jobs: Vec<Job> = chosen
        .iter()
        .flat_map(|&scenario| {
            seeds.iter().flat_map(move |&seed| {
                Placer::ALL.into_iter().map(move |placer| Job {
                    scenario,
                    seed,
                    placer,
                })
            })
        })
        .collect();
    let totals: Vec<Totals> = thread::scope(|s| {
        let handles: Vec<_> = jobs
            .iter()
            .map(|j| s.spawn(move || fly(j, seconds, extra)))
            .collect();
        handles
            .into_iter()
            .map(|h| h.join().expect("a run"))
            .collect()
    });
    let ran = |scenario: Scenario, placer: Placer| -> Vec<&Totals> {
        jobs.iter()
            .zip(&totals)
            .filter(|(j, _)| j.scenario == scenario && j.placer == placer)
            .map(|(_, t)| t)
            .collect()
    };
    let mut complaints = Vec::new();
    for &scenario in &chosen {
        let [annealed, greedy] = Placer::ALL.map(|p| report(&ran(scenario, p)));
        for (placer, r) in Placer::ALL.iter().zip([&annealed, &greedy]) {
            let cells: Vec<String> = COLUMNS
                .iter()
                .zip(r.metrics)
                .map(|(name, v)| match *name {
                    "energy" => format!("{name} {v:>6.0}"),
                    _ => format!("{name} {v:.2}"),
                })
                .collect();
            let outer = r
                .outer
                .map_or(String::new(), |o| format!("  outer {:.0}%", 100.0 * o));
            println!(
                "{:<9}{:<9}{}  moves/min {:.2}{outer}",
                scenario.name(),
                placer.name(),
                cells.join("  "),
                r.moves_per_min
            );
        }
        if check {
            complaints.extend(complaints_of(scenario.name(), &annealed, &greedy, extra));
        }
    }
    if complaints.is_empty() {
        ExitCode::SUCCESS
    } else {
        eprintln!("{}", complaints.join("\n"));
        ExitCode::FAILURE
    }
}
