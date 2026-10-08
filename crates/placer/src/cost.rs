//! The cost of every bearing a block could take, as tables an optimiser looks up.

use std::collections::HashMap;

use crate::geometry::{
    DB_HEIGHT, DB_WIDTH, DIRECTIONS, GLYPH_HALF, NE, Rect, Vec2, angle_deg, block_height,
    block_rect, leader, overlap, unit,
};
use crate::hyper::{Energy, Weights};
use crate::relations::{Converging, heading, mirror, relations, side};

/// What the placer knows of a track, in CSS px at the layout scale, y down.
#[derive(Debug)]
pub struct Subject {
    pub cx: f64,
    pub cy: f64,
    /// Velocity, px per second.
    pub vx: f64,
    pub vy: f64,
    pub extra_lines: u32,
    /// Direction the block sits at; none for a track not yet placed.
    pub dir: Option<usize>,
    /// Seconds since the block last moved; infinite when it never has.
    pub since_move: f64,
    /// Whether the operator placed the block where it sits.
    pub manual: bool,
    /// Feet; 0 on the ground, NaN when unknown.
    pub altitude_ft: f64,
    /// Degrees per second, a right turn positive; 0 when unknown.
    pub turn_rate_deg_per_sec: f64,
    /// Position reports of the last 30 s, in the same px, newest first.
    pub history: Vec<Vec2>,
}

impl Default for Subject {
    fn default() -> Self {
        Self {
            cx: 0.0,
            cy: 0.0,
            vx: 0.0,
            vy: 0.0,
            extra_lines: 0,
            dir: None,
            since_move: f64::INFINITY,
            manual: false,
            altitude_ft: f64::NAN,
            turn_rate_deg_per_sec: 0.0,
            history: Vec::new(),
        }
    }
}

/// The tracks and what they are laid out among.
#[derive(Debug)]
pub struct Scene {
    pub subjects: Vec<Subject>,
    /// The subjects' scale, to judge distances in miles.
    pub px_per_nm: f64,
}

/// How far ahead the predicted path reaches, whatever the drawn vector shows.
const PATH_SEC: f64 = 90.0;
/// How close to a leader another glyph starts to confuse whose it is.
const AMBIGUITY_PX: f64 = 12.0;
/// How close a position report counts as under the block.
const HISTORY_PX: f64 = 2.0;
/// Reports under a block beyond this cost nothing more.
const HISTORY_CAP: usize = 6;

/// The cells of a pair table: the row is the direction of `i`, the column that of `j`.
pub const CELLS: usize = DIRECTIONS * DIRECTIONS;

#[derive(Debug)]
pub struct Pair {
    pub i: usize,
    pub j: usize,
    pub cost: [f64; CELLS],
}

/// The cost of every choice, looked up by the annealer: `unary[i * 8 + c]` and the pair tables.
#[derive(Debug)]
pub struct Tables {
    pub unary: Vec<f64>,
    pub pairs: Vec<Pair>,
    /// Tracks in trail together, as index lists, for a flip of a whole chain.
    pub chains: Vec<Vec<usize>>,
    /// Per track and direction, the direction across its heading: `mirror[i * 8 + c]`.
    pub mirror: Vec<usize>,
}

#[derive(Clone, Copy, Debug)]
struct Segment {
    a: Vec2,
    b: Vec2,
    /// The box round the segment, for a quick miss.
    bx: Rect,
}

impl Segment {
    fn new(a: Vec2, b: Vec2) -> Self {
        Self {
            a,
            b,
            bx: Rect::around(a).including(b),
        }
    }
}

/// One track's eight blocks and leaders laid out, with its predicted path and history.
struct Laid {
    /// Where the track is, at this horizon.
    at: Vec2,
    rects: [Rect; DIRECTIONS],
    leaders: [Segment; DIRECTIONS],
    path: Option<Segment>,
    /// How far from the target any of its blocks reaches.
    reach: f64,
    /// The box round the target and all eight of its blocks, so all of its leaders.
    bounds: Rect,
    /// The box round its position reports, or none without any.
    trail: Option<Rect>,
}

/// A track laid out where it will be `sec` ahead: now at 0.
fn lay(subject: &Subject, sec: f64) -> Laid {
    let at = Vec2::new(subject.cx + subject.vx * sec, subject.cy + subject.vy * sec);
    let height = block_height(subject.extra_lines);
    let rects: [Rect; DIRECTIONS] =
        std::array::from_fn(|c| block_rect(at.x, at.y, c, subject.extra_lines));
    let leaders: [Segment; DIRECTIONS] = std::array::from_fn(|c| {
        let rect = rects[c];
        let (from, to) = leader(rect.x0 - at.x, rect.y0 - at.y, height);
        Segment::new(at + from, at + to)
    });
    let mut reach: f64 = 0.0;
    let mut bounds = Rect::around(at);
    for r in &rects {
        bounds = bounds
            .including(Vec2::new(r.x0, r.y0))
            .including(Vec2::new(r.x1, r.y1));
        reach = reach
            .max((Vec2::new(r.x0, r.y0) - at).len())
            .max((Vec2::new(r.x1, r.y1) - at).len());
    }
    let moving = subject.vx != 0.0 || subject.vy != 0.0;
    let path = moving.then(|| Segment::new(at, at + Vec2::new(subject.vx, subject.vy) * PATH_SEC));
    let trail = subject.history.split_first().map(|(first, rest)| {
        rest.iter()
            .fold(Rect::around(*first), |r, p| r.including(*p))
    });
    Laid {
        at,
        rects,
        leaders,
        path,
        reach,
        bounds,
        trail,
    }
}

/// Whether segments `ab` and `cd` cross at a single interior point.
fn proper_cross(a: Vec2, b: Vec2, c: Vec2, d: Vec2) -> bool {
    let cross = |o: Vec2, p: Vec2, q: Vec2| (p - o).cross(q - o);
    cross(c, d, a) * cross(c, d, b) < 0.0 && cross(a, b, c) * cross(a, b, d) < 0.0
}

fn segments_cross(p: &Segment, q: &Segment) -> bool {
    p.bx.touches(q.bx) && proper_cross(p.a, p.b, q.a, q.b)
}

/// Whether a segment touches a rectangle: an end inside it, or a crossing of one of its edges.
fn segment_hits_rect(s: &Segment, r: Rect) -> bool {
    if !s.bx.touches(r) {
        return false;
    }
    if r.contains(s.a) || r.contains(s.b) {
        return true;
    }
    let corners = [
        Vec2::new(r.x0, r.y0),
        Vec2::new(r.x1, r.y0),
        Vec2::new(r.x1, r.y1),
        Vec2::new(r.x0, r.y1),
    ];
    (0..4).any(|k| proper_cross(s.a, s.b, corners[k], corners[(k + 1) % 4]))
}

/// The angle preference of EUROCONTROL EEC Note 19/05: full cost with the block ahead or abeam,
/// none at 135° behind, half straight behind.
fn angle_penalty(deg: f64) -> f64 {
    if deg <= 90.0 {
        1.0
    } else if deg <= 135.0 {
        1.0 - (deg - 90.0) / 45.0
    } else {
        0.5 * (deg - 135.0) / 45.0
    }
}

/// Steps round the compass from one direction to another, 0 to 4.
fn steps(from: usize, to: usize) -> usize {
    let d = from.abs_diff(to) % DIRECTIONS;
    d.min(DIRECTIONS - d)
}

#[allow(clippy::cast_precision_loss)]
fn as_f64(n: usize) -> f64 {
    n as f64
}

/// Whether two tracks' blocks, leaders, predicted paths or histories can reach each other.
fn near(la: &Laid, lb: &Laid) -> bool {
    let (p, q) = (la.at, lb.at);
    if (p - q).len() <= la.reach + lb.reach {
        return true;
    }
    if lb
        .path
        .is_some_and(|s| p.distance_to_segment(s.a, s.b) <= la.reach)
    {
        return true;
    }
    if la
        .path
        .is_some_and(|s| q.distance_to_segment(s.a, s.b) <= lb.reach)
    {
        return true;
    }
    if lb.trail.is_some_and(|t| la.bounds.touches(t)) {
        return true;
    }
    la.trail.is_some_and(|t| lb.bounds.touches(t))
}

/// A converging partner as one track sees it: the bearing to it and the pair's urgency.
struct Partner {
    bearing: Vec2,
    urgency: f64,
}

/// What a block in each direction costs for the other tracks round it: their glyphs under it,
/// near its leader or nearer it than its own, and their predicted paths through it. Judged
/// again at each horizon.
fn foreign_costs(l: &Laid, neighbours: &[&Laid], w: &Weights) -> [f64; DIRECTIONS] {
    std::array::from_fn(|c| {
        let r = l.rects[c];
        let clear = r.inflated(GLYPH_HALF);
        let mid = r.centre();
        let own_distance = (mid - l.at).len();
        let ld = &l.leaders[c];
        let mut cost = 0.0;
        for n in neighbours {
            if clear.contains(n.at) {
                cost += w.foreign_glyph;
            }
            let d = n.at.distance_to_segment(ld.a, ld.b);
            if d < AMBIGUITY_PX {
                cost += w.ambiguity * (1.0 - d / AMBIGUITY_PX);
            }
            if (mid - n.at).len() < own_distance {
                cost += 0.5 * w.ambiguity;
            }
            if n.path.is_some_and(|p| segment_hits_rect(&p, r)) {
                cost += w.foreign_path;
            }
        }
        cost
    })
}

/// What a block in each direction costs on its own account and for what is drawn now.
fn unary_costs(
    subject: &Subject,
    laid: &Laid,
    neighbours: &[(&Subject, &Laid)],
    partners: &[Partner],
    turning: bool,
    energy: &Energy,
) -> [f64; DIRECTIONS] {
    let w = &energy.weights;
    let mv = &energy.moving;
    let velocity = Vec2::new(subject.vx, subject.vy);
    let around: Vec<&Laid> = neighbours.iter().map(|(_, l)| *l).collect();
    let foreign = foreign_costs(laid, &around, w);
    std::array::from_fn(|c| {
        let rect = laid.rects[c];
        let along = unit(c);
        let mut cost = foreign[c];
        cost += w.default_dir
            * (1.0 - ((as_f64(c) - as_f64(NE)) * std::f64::consts::PI / 4.0).cos())
            / 2.0;
        if laid.path.is_some() {
            cost += w.angle * angle_penalty(angle_deg(along, velocity));
        }
        if let Some(from) = subject.dir.filter(|&from| from != c) {
            let dwell = if subject.since_move < mv.dwell_sec {
                mv.dwell
            } else {
                1.0
            };
            let hold = if turning { mv.turning } else { 1.0 };
            let hand = if subject.manual { mv.manual } else { 1.0 };
            cost +=
                w.moving * dwell * hold * hand * (0.5 + 0.5 * (as_f64(steps(from, c)) - 1.0) / 3.0);
        }
        if laid.path.is_some_and(|p| segment_hits_rect(&p, rect)) {
            cost += w.own_path;
        }
        for p in partners {
            cost += w.converging * p.urgency * along.dot(p.bearing).max(0.0);
        }
        let marks = rect.inflated(HISTORY_PX);
        let mut reports = subject
            .history
            .iter()
            .filter(|p| marks.contains(**p))
            .count();
        for (n, nl) in neighbours {
            if nl.trail.is_some_and(|t| t.touches(marks)) {
                reports += n.history.iter().filter(|p| marks.contains(**p)).count();
            }
        }
        cost += w.history * as_f64(reports.min(HISTORY_CAP));
        cost
    })
}

fn pair_costs(a: &Laid, b: &Laid, w: &Weights) -> [f64; CELLS] {
    let mut cost = [0.0; CELLS];
    for (ci, ra) in a.rects.iter().enumerate() {
        for (cj, rb) in b.rects.iter().enumerate() {
            let mut x = 0.0;
            let shared = overlap(*ra, *rb);
            if shared > 0.0 {
                x += w.overlap + w.overlap_area * shared / (DB_WIDTH * DB_HEIGHT);
            }
            let (la, lb) = (&a.leaders[ci], &b.leaders[cj]);
            if segment_hits_rect(la, *rb) {
                x += w.leader_through;
            }
            if segment_hits_rect(lb, *ra) {
                x += w.leader_through;
            }
            if segments_cross(la, lb) {
                x += w.leader_cross;
            }
            cost[ci * DIRECTIONS + cj] = x;
        }
    }
    cost
}

/// 0 for two blocks on the same side of their stream, 1 on opposite sides, 0.5 with one ahead or behind.
fn side_mismatch(ha: Vec2, ca: usize, hb: Vec2, cb: usize) -> f64 {
    let (sa, sb) = (side(ha, ca), side(hb, cb));
    if sa == 0 || sb == 0 {
        0.5
    } else if sa == sb {
        0.0
    } else {
        1.0
    }
}

fn add_flow_side(cost: &mut [f64; CELLS], ha: Vec2, hb: Vec2, weight: f64) {
    for ci in 0..DIRECTIONS {
        for cj in 0..DIRECTIONS {
            cost[ci * DIRECTIONS + cj] += weight * side_mismatch(ha, ci, hb, cj);
        }
    }
}

/// Each track's converging partners, as it sees them.
fn partners_of(subjects: &[Subject], converging: &[Converging]) -> Vec<Vec<Partner>> {
    let mut partners: Vec<Vec<Partner>> = subjects.iter().map(|_| Vec::new()).collect();
    for c in converging {
        let (a, b) = (&subjects[c.i], &subjects[c.j]);
        let d = Vec2::new(b.cx - a.cx, b.cy - a.cy);
        let len = if d.len() == 0.0 { 1.0 } else { d.len() };
        partners[c.i].push(Partner {
            bearing: d * (1.0 / len),
            urgency: c.urgency,
        });
        partners[c.j].push(Partner {
            bearing: d * (-1.0 / len),
            urgency: c.urgency,
        });
    }
    partners
}

/// The cost tables for a scene under an energy: the unary costs of every track in every
/// direction, and a table for every pair of tracks whose blocks can meet or that fly in trail.
#[must_use]
pub fn build_tables(scene: &Scene, energy: &Energy) -> Tables {
    let subjects = &scene.subjects;
    let n = subjects.len();
    let rel = relations(subjects, scene.px_per_nm);
    let headings: Vec<Option<Vec2>> = subjects.iter().map(heading).collect();
    let partners = partners_of(subjects, &rel.converging);
    let mut unary = vec![0.0; n * DIRECTIONS];
    let mut pairs: Vec<Pair> = Vec::new();
    let mut pair_at: HashMap<(usize, usize), usize> = HashMap::new();
    let mut pair_of = |i: usize, j: usize, pairs: &mut Vec<Pair>| -> usize {
        *pair_at.entry((i, j)).or_insert_with(|| {
            pairs.push(Pair {
                i,
                j,
                cost: [0.0; CELLS],
            });
            pairs.len() - 1
        })
    };
    let horizons: Vec<(f64, f64)> = std::iter::once((0.0, 1.0))
        .chain(
            energy
                .lookahead
                .horizons
                .iter()
                .map(|h| (h.sec, energy.lookahead.weight * h.weight)),
        )
        .collect();
    for (sec, weight) in horizons {
        let now = sec == 0.0;
        let laid: Vec<Laid> = subjects.iter().map(|s| lay(s, sec)).collect();
        let mut neighbours: Vec<Vec<usize>> = (0..n).map(|_| Vec::new()).collect();
        for i in 0..n {
            for j in i + 1..n {
                let (la, lb) = (&laid[i], &laid[j]);
                let linked = now && (rel.leader[i] == Some(j) || rel.leader[j] == Some(i));
                let close = near(la, lb);
                if !close && !linked {
                    continue;
                }
                if close {
                    neighbours[i].push(j);
                    neighbours[j].push(i);
                }
                if la.bounds.touches(lb.bounds) {
                    let k = pair_of(i, j, &mut pairs);
                    let costs = pair_costs(la, lb, &energy.weights);
                    for (cell, c) in pairs[k].cost.iter_mut().zip(costs) {
                        *cell += weight * c;
                    }
                }
                if let (true, Some(ha), Some(hb)) = (linked, headings[i], headings[j]) {
                    let k = pair_of(i, j, &mut pairs);
                    add_flow_side(&mut pairs[k].cost, ha, hb, energy.weights.flow_side);
                }
            }
        }
        for (i, s) in subjects.iter().enumerate() {
            let l = &laid[i];
            let costs = if now {
                let around: Vec<(&Subject, &Laid)> = neighbours[i]
                    .iter()
                    .map(|&j| (&subjects[j], &laid[j]))
                    .collect();
                unary_costs(s, l, &around, &partners[i], rel.turning[i], energy)
            } else {
                let around: Vec<&Laid> = neighbours[i].iter().map(|&j| &laid[j]).collect();
                foreign_costs(l, &around, &energy.weights)
            };
            for (cell, c) in unary[i * DIRECTIONS..(i + 1) * DIRECTIONS]
                .iter_mut()
                .zip(costs)
            {
                *cell += weight * c;
            }
        }
    }
    let mut mirrors = vec![0; n * DIRECTIONS];
    for (i, h) in headings.iter().enumerate() {
        for c in 0..DIRECTIONS {
            mirrors[i * DIRECTIONS + c] = h.map_or(c, |h| mirror(h, c));
        }
    }
    pairs.retain(|p| p.cost.iter().any(|&x| x > 0.0));
    Tables {
        unary,
        pairs,
        chains: rel.chains,
        mirror: mirrors,
    }
}

/// The total cost of an assignment of a direction to every track.
#[must_use]
pub fn evaluate(tables: &Tables, dirs: &[usize]) -> f64 {
    let mut energy: f64 = dirs
        .iter()
        .enumerate()
        .map(|(i, &c)| tables.unary[i * DIRECTIONS + c])
        .sum();
    for p in &tables.pairs {
        energy += p.cost[dirs[p.i] * DIRECTIONS + dirs[p.j]];
    }
    energy
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry::{E, N, NW, S, SE, SW, W};
    use crate::hyper::{HYPER, Term};

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

    /// The energy with every term but those named switched off, so a test sees one alone.
    fn only(terms: &[Term]) -> Energy {
        HYPER.energy.only(terms)
    }

    fn unary_of(t: &Tables, i: usize) -> Vec<f64> {
        t.unary[i * 8..i * 8 + 8].to_vec()
    }

    fn cell(t: &Tables, ci: usize, cj: usize) -> f64 {
        t.pairs[0].cost[ci * 8 + cj]
    }

    fn round(xs: &[f64]) -> Vec<f64> {
        xs.iter().map(|x| (x * 100.0).round() / 100.0).collect()
    }

    fn close(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-6
    }

    #[test]
    fn prefers_north_east_by_default_and_south_west_least() {
        // Arrange
        let subjects = vec![subject(0.0, 0.0)];

        // Act
        let u = unary_of(
            &build_tables(&scene(subjects), &only(&[Term::DefaultDir])),
            0,
        );

        // Assert
        assert!(close(u[NE], 0.0));
        assert!(close(u[SW], 6.0));
        assert!(close(u[E], u[N]));
    }

    #[test]
    fn penalises_a_block_ahead_of_or_abeam_the_aircraft_not_one_in_the_rear_quarters() {
        // Arrange
        let subjects = vec![Subject {
            vx: 1.0,
            ..subject(0.0, 0.0)
        }];

        // Act
        let u = round(&unary_of(
            &build_tables(&scene(subjects), &only(&[Term::Angle])),
            0,
        ));

        // Assert
        assert_eq!(u, [20.0, 20.0, 20.0, 0.0, 10.0, 0.0, 20.0, 20.0]);
    }

    #[test]
    fn charges_a_move_by_its_distance_round_the_compass_triple_soon_after_the_last_move() {
        // Arrange
        let settled = vec![Subject {
            dir: Some(NE),
            ..subject(0.0, 0.0)
        }];
        let fresh = vec![Subject {
            dir: Some(NE),
            since_move: 10.0,
            ..subject(0.0, 0.0)
        }];
        let unplaced = vec![subject(0.0, 0.0)];

        // Act
        let costs: Vec<Vec<f64>> = [settled, fresh, unplaced]
            .into_iter()
            .map(|s| round(&unary_of(&build_tables(&scene(s), &only(&[Term::Move])), 0)))
            .collect();

        // Assert
        assert_eq!(
            costs[0],
            [50.0, 66.67, 83.33, 100.0, 83.33, 66.67, 50.0, 0.0]
        );
        assert_eq!(
            costs[1],
            [150.0, 200.0, 250.0, 300.0, 250.0, 200.0, 150.0, 0.0]
        );
        assert_eq!(costs[2], [0.0; 8]);
    }

    #[test]
    fn charges_a_block_that_covers_its_own_aircrafts_predicted_path() {
        // Arrange
        let subjects = vec![Subject {
            vx: 10.0,
            ..subject(0.0, 0.0)
        }];

        // Act
        let u = unary_of(&build_tables(&scene(subjects), &only(&[Term::OwnPath])), 0);

        // Assert
        assert!(close(u[E], 300.0));
        assert!(close(u[W], 0.0));
    }

    #[test]
    fn charges_a_block_that_covers_another_aircrafts_predicted_path() {
        // Arrange
        let subjects = vec![
            subject(0.0, 0.0),
            Subject {
                vx: 10.0,
                ..subject(-200.0, -32.0)
            },
        ];

        // Act
        let u = unary_of(
            &build_tables(&scene(subjects), &only(&[Term::ForeignPath])),
            0,
        );

        // Assert
        assert!(close(u[NE], 150.0));
        assert!(close(u[SE], 0.0));
    }

    #[test]
    fn charges_a_block_that_covers_another_aircrafts_glyph() {
        // Arrange
        let subjects = vec![subject(0.0, 0.0), subject(50.0, -32.0)];

        // Act
        let u = unary_of(
            &build_tables(&scene(subjects), &only(&[Term::ForeignGlyph])),
            0,
        );

        // Assert
        assert!(close(u[NE], 600.0));
        assert!(close(u[SW], 0.0));
    }

    #[test]
    fn charges_a_leader_that_passes_another_aircrafts_glyph_the_closer_the_more() {
        // Arrange
        let subjects = vec![subject(0.0, 0.0), subject(10.0, -10.0)];

        // Act
        let u = unary_of(
            &build_tables(&scene(subjects), &only(&[Term::Ambiguity])),
            0,
        );

        // Assert
        assert!((u[NE] - 375.0).abs() < 0.01); // on the leader, and nearer the block than its own glyph
        assert!(u[E] > 0.0 && u[E] < 250.0);
        assert!(close(u[SW], 0.0));
    }

    #[test]
    fn charges_overlapping_blocks_by_their_shared_area_on_top_of_a_flat_fee() {
        // Arrange
        let subjects = vec![subject(0.0, 0.0), subject(0.0, 10.0)];

        // Act
        let t = build_tables(&scene(subjects), &only(&[Term::Overlap, Term::OverlapArea]));

        // Assert
        assert_eq!(t.pairs.len(), 1);
        assert!((cell(&t, NE, NE) - (400.0 + 1000.0 * 80.0 * 16.0 / (80.0 * 26.0))).abs() < 0.01);
        assert!(close(cell(&t, NE, SW), 0.0));
    }

    #[test]
    fn charges_a_leader_that_runs_through_another_aircrafts_block() {
        // Arrange
        let subjects = vec![subject(0.0, 0.0), subject(-20.0, -40.0)];

        // Act
        let t = build_tables(&scene(subjects), &only(&[Term::LeaderThrough]));

        // Assert
        assert!(close(cell(&t, NE, SE), 250.0));
        assert!(close(cell(&t, SW, SE), 0.0));
    }

    #[test]
    fn charges_leaders_that_cross() {
        // Arrange
        let subjects = vec![subject(0.0, 0.0), subject(20.0, 0.0)];

        // Act
        let t = build_tables(&scene(subjects), &only(&[Term::LeaderCross]));

        // Assert
        assert!(close(cell(&t, NE, NW), 200.0));
        assert!(close(cell(&t, NE, NE), 0.0));
    }

    #[test]
    fn keeps_no_table_for_aircraft_too_far_apart_to_interact() {
        // Arrange
        let subjects = vec![subject(0.0, 0.0), subject(1000.0, 1000.0)];

        // Act
        let t = build_tables(&scene(subjects), &HYPER.energy);

        // Assert
        assert!(t.pairs.is_empty());
    }

    #[test]
    fn evaluate_sums_the_unary_and_pair_costs_of_an_assignment() {
        // Arrange
        let subjects = vec![
            Subject {
                dir: Some(NE),
                ..subject(0.0, 0.0)
            },
            subject(0.0, 10.0),
        ];
        let t = build_tables(&scene(subjects), &HYPER.energy);

        // Act
        let energy = evaluate(&t, &[SW, NE]);

        // Assert
        let expected = unary_of(&t, 0)[SW] + unary_of(&t, 1)[NE] + cell(&t, SW, NE);
        assert!((energy - expected).abs() < 1e-6);
        assert!(energy > 0.0);
    }

    #[test]
    fn charges_in_trail_blocks_on_opposite_sides_half_when_one_is_ahead_or_behind() {
        // Arrange
        let in_trail = |cx| Subject {
            vx: 150.0 * 10.0 / 3600.0,
            altitude_ft: 3000.0,
            ..subject(cx, 0.0)
        };
        let subjects = vec![in_trail(0.0), in_trail(30.0)];

        // Act
        let t = build_tables(&scene(subjects), &only(&[Term::FlowSide]));

        // Assert
        assert!(close(cell(&t, N, N), 0.0));
        assert!(close(cell(&t, N, S), 110.0));
        assert!(close(cell(&t, N, E), 55.0));
    }

    #[test]
    fn charges_a_block_between_a_converging_pair_by_the_urgency_and_how_squarely_it_sits_between() {
        // Arrange
        let subjects = vec![
            Subject {
                vx: 1.0,
                ..subject(0.0, 0.0)
            },
            Subject {
                vy: 1.0,
                ..subject(120.0, -120.0)
            },
        ];

        // Act
        let u = unary_of(
            &build_tables(&scene(subjects), &only(&[Term::Converging])),
            0,
        );

        // Assert
        assert!((u[NE] - 60.0).abs() < 0.01);
        assert!((u[E] - 60.0 * std::f64::consts::FRAC_1_SQRT_2).abs() < 0.01);
        assert!(close(u[SW], 0.0));
    }

    #[test]
    fn charges_a_turning_aircraft_five_times_as_much_to_move_its_block() {
        // Arrange
        let subjects = vec![Subject {
            dir: Some(NE),
            turn_rate_deg_per_sec: 2.0,
            ..subject(0.0, 0.0)
        }];

        // Act
        let u = unary_of(&build_tables(&scene(subjects), &only(&[Term::Move])), 0);

        // Assert
        assert!(close(u[E], 250.0));
        assert!(close(u[NE], 0.0));
    }

    #[test]
    fn charges_each_position_report_under_a_block_up_to_six() {
        // Arrange
        let few = vec![Subject {
            history: vec![Vec2::new(50.0, -32.0), Vec2::new(60.0, -32.0)],
            ..subject(0.0, 0.0)
        }];
        let many = vec![Subject {
            history: (0..8)
                .map(|i| Vec2::new(30.0 + f64::from(i) * 5.0, -32.0))
                .collect(),
            ..subject(0.0, 0.0)
        }];

        // Act
        let costs: Vec<Vec<f64>> = [few, many]
            .into_iter()
            .map(|s| unary_of(&build_tables(&scene(s), &only(&[Term::History])), 0))
            .collect();

        // Assert
        assert!(close(costs[0][NE], 80.0));
        assert!(close(costs[0][SW], 0.0));
        assert!(close(costs[1][NE], 240.0));
    }

    #[test]
    fn charges_half_a_leader_ambiguity_for_each_glyph_closer_to_the_block_than_its_own() {
        // Arrange
        let subjects = vec![subject(0.0, 0.0), subject(60.0, -40.0)];

        // Act
        let u = unary_of(
            &build_tables(&scene(subjects), &only(&[Term::Ambiguity])),
            0,
        );

        // Assert
        assert!((u[NE] - 125.0).abs() < 0.01);
        assert!(close(u[SW], 0.0));
    }

    /// One term alone, with the horizons weighed in as the energy has them.
    fn ahead(terms: &[Term]) -> Energy {
        Energy {
            lookahead: HYPER.energy.lookahead.clone(),
            ..only(terms)
        }
    }

    #[test]
    fn adds_the_overlap_a_pair_will_have_at_a_horizon_scaled_by_it() {
        // Arrange
        let subjects = vec![
            subject(0.0, 0.0),
            Subject {
                vy: -1.0,
                ..subject(0.0, 40.0)
            },
        ]; // level with a in 30 s

        // Act
        let t = build_tables(
            &scene(subjects),
            &ahead(&[Term::Overlap, Term::OverlapArea]),
        );

        // Assert
        let expected = 0.35 * (400.0 + 1000.0 * 80.0 * 16.0 / (80.0 * 26.0));
        assert!((cell(&t, NE, NE) - expected).abs() < 0.01);
    }

    #[test]
    fn adds_a_glyph_that_will_be_under_the_block_at_a_horizon_scaled_by_it() {
        // Arrange
        let subjects = vec![
            subject(0.0, 0.0),
            Subject {
                vy: -2.0,
                ..subject(50.0, 28.0)
            },
        ]; // under north-east in 30 s

        // Act
        let u = unary_of(
            &build_tables(&scene(subjects), &ahead(&[Term::ForeignGlyph])),
            0,
        );

        // Assert
        assert!((u[NE] - 0.35 * 600.0).abs() < 0.01);
        assert!(close(u[SE], 600.0));
    }

    #[test]
    fn charges_five_times_as_much_to_move_a_block_the_operator_placed() {
        // Arrange
        let placed = vec![Subject {
            dir: Some(NE),
            ..subject(0.0, 0.0)
        }];
        let by_hand = vec![Subject {
            dir: Some(NE),
            manual: true,
            ..subject(0.0, 0.0)
        }];

        // Act
        let costs: Vec<Vec<f64>> = [placed, by_hand]
            .into_iter()
            .map(|s| round(&unary_of(&build_tables(&scene(s), &only(&[Term::Move])), 0)))
            .collect();

        // Assert
        assert!(close(costs[1][E], 5.0 * costs[0][E]));
        assert!(close(costs[1][NE], 0.0));
    }
}
