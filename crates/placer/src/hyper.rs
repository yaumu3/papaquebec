//! The placer's numbers, from `hyperparams.json`: two energies and how the annealer searches.

use std::sync::LazyLock;

use serde::Deserialize;

/// Weights of the cost terms. They fall in tiers, so a lower tier cannot outvote a higher one:
/// what must not happen (a block over a glyph or another block), what should not (leaders
/// through blocks or crossing, blocks over predicted paths, leaders near other glyphs), what
/// costs the reader (a move), and taste (the block's bearing).
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Weights {
    /// Two blocks that overlap, plus `overlap_area` per block area they share.
    pub overlap: f64,
    pub overlap_area: f64,
    /// A leader through another track's block.
    pub leader_through: f64,
    /// Two leaders that cross.
    pub leader_cross: f64,
    /// Another track's glyph under the block.
    pub foreign_glyph: f64,
    /// Another track's glyph near the leader, scaled by closeness.
    pub ambiguity: f64,
    /// The block over its own track's predicted path.
    pub own_path: f64,
    /// The block over another track's predicted path.
    pub foreign_path: f64,
    /// The block ahead of or abeam the aircraft rather than in a rear quarter.
    pub angle: f64,
    /// Any bearing but north-east: the angle term is symmetric, this picks a side.
    pub default_dir: f64,
    /// Moving a block, by distance round the compass.
    #[serde(rename = "move")]
    pub moving: f64,
    /// In-trail blocks on opposite sides of their stream; half when one is ahead or behind.
    pub flow_side: f64,
    /// A block between a converging pair, by urgency and how squarely it sits between.
    pub converging: f64,
    /// Each position report under the block, up to six.
    pub history: f64,
}

/// A cost term, to switch the others off and see it alone.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Term {
    Overlap,
    OverlapArea,
    LeaderThrough,
    LeaderCross,
    ForeignGlyph,
    Ambiguity,
    OwnPath,
    ForeignPath,
    Angle,
    DefaultDir,
    Move,
    FlowSide,
    Converging,
    History,
}

impl Weights {
    pub fn set(&mut self, term: Term, value: f64) {
        match term {
            Term::Overlap => self.overlap = value,
            Term::OverlapArea => self.overlap_area = value,
            Term::LeaderThrough => self.leader_through = value,
            Term::LeaderCross => self.leader_cross = value,
            Term::ForeignGlyph => self.foreign_glyph = value,
            Term::Ambiguity => self.ambiguity = value,
            Term::OwnPath => self.own_path = value,
            Term::ForeignPath => self.foreign_path = value,
            Term::Angle => self.angle = value,
            Term::DefaultDir => self.default_dir = value,
            Term::Move => self.moving = value,
            Term::FlowSide => self.flow_side = value,
            Term::Converging => self.converging = value,
            Term::History => self.history = value,
        }
    }
}

/// Every term, in the order of `Weights`.
const TERMS: [Term; 14] = [
    Term::Overlap,
    Term::OverlapArea,
    Term::LeaderThrough,
    Term::LeaderCross,
    Term::ForeignGlyph,
    Term::Ambiguity,
    Term::OwnPath,
    Term::ForeignPath,
    Term::Angle,
    Term::DefaultDir,
    Term::Move,
    Term::FlowSide,
    Term::Converging,
    Term::History,
];

/// What multiplies the move cost: `dwell` within `dwell_sec` of the block's last move,
/// `turning` while the aircraft turns, since the angle term follows the heading round, and
/// `manual` for a block the operator placed, so that only a hard conflict can move it.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveCost {
    pub dwell_sec: f64,
    pub dwell: f64,
    pub turning: f64,
    pub manual: f64,
}

#[derive(Clone, Debug, Deserialize)]
pub struct Horizon {
    pub sec: f64,
    pub weight: f64,
}

/// The horizons at which blocks, leaders and glyphs are judged again where the aircraft will
/// be: each adds its terms at `weight` times the horizon's own weight.
#[derive(Clone, Debug, Deserialize)]
pub struct Lookahead {
    pub weight: f64,
    pub horizons: Vec<Horizon>,
}

/// The weights, move multipliers and look-ahead that together define one energy over a layout.
#[derive(Clone, Debug, Deserialize)]
pub struct Energy {
    pub weights: Weights,
    #[serde(rename = "move")]
    pub moving: MoveCost,
    pub lookahead: Lookahead,
}

impl Energy {
    /// This energy with every term but those named switched off, and no look-ahead, to see
    /// one alone.
    #[must_use]
    pub fn only(&self, terms: &[Term]) -> Self {
        let mut out = self.clone();
        for t in TERMS {
            if !terms.contains(&t) {
                out.weights.set(t, 0.0);
            }
        }
        out.lookahead.weight = 0.0;
        out
    }
}

#[derive(Clone, Debug, Deserialize)]
pub struct Temperature {
    pub start: f64,
    pub end: f64,
}

/// Two energies and how the annealer searches. `scoring` is the hand-set objective, what a
/// good layout is, and is never tuned; `search` is what the annealer minimises, tuned against
/// it and starting equal to it. The rest steers the search.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hyperparams {
    pub scoring: Energy,
    pub search: Energy,
    /// The annealer cools geometrically from `start` to `end` over a run.
    pub temperature: Temperature,
    /// How long a run may take, per update.
    pub budget_ms: f64,
    /// How often a step offers a whole chain the other side of its stream, 0 to 1.
    pub chain_flip: f64,
}

/// The numbers as committed.
pub static HYPER: LazyLock<Hyperparams> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../hyperparams.json"))
        .expect("hyperparams.json is well formed")
});
