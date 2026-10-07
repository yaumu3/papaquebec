//! Block and leader geometry in CSS px, y down, as the scope draws them.

/// A point or vector on screen.
#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct Vec2 {
    pub x: f64,
    pub y: f64,
}

impl Vec2 {
    #[must_use]
    pub const fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    #[must_use]
    pub fn dot(self, o: Self) -> f64 {
        self.x * o.x + self.y * o.y
    }

    /// The cross product's z, the signed area the two vectors span.
    #[must_use]
    pub fn cross(self, o: Self) -> f64 {
        self.x * o.y - self.y * o.x
    }

    #[must_use]
    pub fn len(self) -> f64 {
        self.x.hypot(self.y)
    }

    /// How far the point is from segment `ab`.
    #[must_use]
    pub fn distance_to_segment(self, a: Self, b: Self) -> f64 {
        let ab = b - a;
        let len2 = ab.dot(ab);
        let t = if len2 == 0.0 {
            0.0
        } else {
            ((self - a).dot(ab) / len2).clamp(0.0, 1.0)
        };
        (self - (a + ab * t)).len()
    }
}

impl std::ops::Add for Vec2 {
    type Output = Self;
    fn add(self, o: Self) -> Self {
        Self::new(self.x + o.x, self.y + o.y)
    }
}

impl std::ops::Sub for Vec2 {
    type Output = Self;
    fn sub(self, o: Self) -> Self {
        Self::new(self.x - o.x, self.y - o.y)
    }
}

impl std::ops::Mul<f64> for Vec2 {
    type Output = Self;
    fn mul(self, k: f64) -> Self {
        Self::new(self.x * k, self.y * k)
    }
}

/// An axis-aligned rectangle in CSS px, y down.
#[derive(Clone, Copy, Debug)]
pub struct Rect {
    pub x0: f64,
    pub y0: f64,
    pub x1: f64,
    pub y1: f64,
}

impl Rect {
    #[must_use]
    pub fn around(p: Vec2) -> Self {
        Self {
            x0: p.x,
            y0: p.y,
            x1: p.x,
            y1: p.y,
        }
    }

    /// The smallest rectangle round this one and `p`.
    #[must_use]
    pub fn including(self, p: Vec2) -> Self {
        Self {
            x0: self.x0.min(p.x),
            y0: self.y0.min(p.y),
            x1: self.x1.max(p.x),
            y1: self.y1.max(p.y),
        }
    }

    #[must_use]
    pub fn inflated(self, by: f64) -> Self {
        Self {
            x0: self.x0 - by,
            y0: self.y0 - by,
            x1: self.x1 + by,
            y1: self.y1 + by,
        }
    }

    #[must_use]
    pub fn centre(self) -> Vec2 {
        Vec2::new(
            f64::midpoint(self.x0, self.x1),
            f64::midpoint(self.y0, self.y1),
        )
    }

    #[must_use]
    pub fn contains(self, p: Vec2) -> bool {
        p.x >= self.x0 && p.x <= self.x1 && p.y >= self.y0 && p.y <= self.y1
    }

    /// Whether the rectangles share any point, an edge included.
    #[must_use]
    pub fn touches(self, o: Self) -> bool {
        self.x0 <= o.x1 && o.x0 <= self.x1 && self.y0 <= o.y1 && o.y0 <= self.y1
    }
}

/// Angle between two vectors, degrees.
#[must_use]
pub fn angle_deg(a: Vec2, b: Vec2) -> f64 {
    let cos = a.dot(b) / (a.len() * b.len());
    cos.clamp(-1.0, 1.0).acos().to_degrees()
}

/// Shared area of two rectangles; edges that only touch share none.
#[must_use]
pub fn overlap(a: Rect, b: Rect) -> f64 {
    let w = a.x1.min(b.x1) - a.x0.max(b.x0);
    let h = a.y1.min(b.y1) - a.y0.max(b.y0);
    if w > 0.0 && h > 0.0 { w * h } else { 0.0 }
}

/// Data block footprint in CSS px: two lines of mono, twelve glyphs wide.
pub const DB_WIDTH: f64 = 80.0;
pub const DB_HEIGHT: f64 = 26.0;
const DB_LINE: f64 = 12.0;
/// Half the box round a target glyph that blocks keep clear of.
pub const GLYPH_HALF: f64 = 8.0;
/// Half the drawn glyph, where a leader starts.
const SYMBOL_HALF: f64 = 3.0;
/// A leader's length, glyph edge to block, the same in every direction.
const LEADER_PX: f64 = 20.0;
/// The gap a leader leaves before the block.
const GAP_PX: f64 = 3.0;

/// The bearings a block can sit at: 0 east, then clockwise on screen, so 2 is south and 6 north.
pub const DIRECTIONS: usize = 8;
pub const E: usize = 0;
pub const SE: usize = 1;
pub const S: usize = 2;
pub const SW: usize = 3;
pub const W: usize = 4;
pub const NW: usize = 5;
pub const N: usize = 6;
pub const NE: usize = 7;
/// The step each direction takes on screen, each part -1, 0 or 1.
const STEPS: [Vec2; DIRECTIONS] = [
    Vec2::new(1.0, 0.0),
    Vec2::new(1.0, 1.0),
    Vec2::new(0.0, 1.0),
    Vec2::new(-1.0, 1.0),
    Vec2::new(-1.0, 0.0),
    Vec2::new(-1.0, -1.0),
    Vec2::new(0.0, -1.0),
    Vec2::new(1.0, -1.0),
];

/// Unit vector along a direction.
#[must_use]
pub fn unit(dir: usize) -> Vec2 {
    let s = STEPS[dir];
    s * (1.0 / s.len())
}

#[must_use]
pub fn block_height(extra_lines: u32) -> f64 {
    DB_HEIGHT + f64::from(extra_lines) * DB_LINE
}

/// Where a leader along `u` leaves the glyph: the square's edge, so its corner on the diagonals.
fn glyph_edge(u: Vec2) -> f64 {
    SYMBOL_HALF / u.x.abs().max(u.y.abs())
}

/// Offset from the target to the top-left corner of a block at `dir`. The block's nearest point
/// lies on the direction's ray at the leader's end: beside the target the block is centred on
/// the leader, elsewhere its corner is at the tip, so the text reads away from the leader.
#[must_use]
fn block_offset(dir: usize, extra_lines: u32) -> Vec2 {
    let s = STEPS[dir];
    let u = unit(dir);
    let reach = glyph_edge(u) + LEADER_PX + GAP_PX;
    let h = block_height(extra_lines);
    let dx = u.x * reach - if s.x < 0.0 { DB_WIDTH } else { 0.0 };
    let dy = u.y * reach
        - if s.y < 0.0 {
            h
        } else if s.y == 0.0 {
            h / 2.0
        } else {
            0.0
        };
    Vec2::new(dx, dy)
}

/// The rectangle a block of `extra_lines` beyond the standard two occupies at `dir` from a target.
#[must_use]
pub fn block_rect(cx: f64, cy: f64, dir: usize, extra_lines: u32) -> Rect {
    let o = block_offset(dir, extra_lines);
    Rect {
        x0: cx + o.x,
        y0: cy + o.y,
        x1: cx + o.x + DB_WIDTH,
        y1: cy + o.y + block_height(extra_lines),
    }
}

/// Where the leader meets a block whose top-left corner is at `dx, dy`: its nearest point.
#[must_use]
fn leader_tip(dx: f64, dy: f64, height: f64) -> Vec2 {
    Vec2::new(
        0.0f64.clamp(dx, dx + DB_WIDTH),
        0.0f64.clamp(dy, dy + height),
    )
}

/// The leader to a block whose top-left corner is at `dx, dy` from the target, in CSS px from
/// the target: from the glyph's edge toward the block's nearest point, stopping short by the gap.
#[must_use]
pub fn leader(dx: f64, dy: f64, height: f64) -> (Vec2, Vec2) {
    let p = leader_tip(dx, dy, height);
    let n = p.len();
    if n == 0.0 {
        return (Vec2::default(), Vec2::default());
    }
    let u = p * (1.0 / n);
    (u * glyph_edge(u), p - u * GAP_PX)
}

#[cfg(test)]
mod tests {
    use super::*;

    const DIRS: [usize; DIRECTIONS] = [0, 1, 2, 3, 4, 5, 6, 7];

    #[test]
    fn overlap_is_the_shared_area_and_nothing_for_rectangles_that_only_touch() {
        // Arrange
        let a = Rect {
            x0: 0.0,
            y0: 0.0,
            x1: 10.0,
            y1: 10.0,
        };
        let pairs = [
            Rect {
                x0: 5.0,
                y0: 5.0,
                x1: 20.0,
                y1: 20.0,
            },
            Rect {
                x0: 10.0,
                y0: 0.0,
                x1: 20.0,
                y1: 10.0,
            },
        ];

        // Act
        let areas: Vec<f64> = pairs.iter().map(|b| overlap(a, *b)).collect();

        // Assert
        assert_eq!(areas, [25.0, 0.0]);
    }

    #[test]
    fn block_rect_puts_the_block_on_the_side_the_direction_names_starting_at_the_leader() {
        // Arrange
        let dirs = [E, S, W, N, NE];

        // Act
        let r: Vec<Rect> = dirs
            .iter()
            .map(|&d| block_rect(100.0, 100.0, d, 0))
            .collect();

        // Assert
        assert!(r[0].x0 > 100.0);
        assert!((r[0].y0 + r[0].y1 - 200.0).abs() < 1e-9);
        assert!(r[1].y0 > 100.0);
        assert!((r[1].x0 - 100.0).abs() < 1e-9);
        assert!(r[2].x1 < 100.0);
        assert!(r[3].y1 < 100.0);
        assert!((r[3].x0 - 100.0).abs() < 1e-9);
        assert!(r[4].x0 > 100.0);
        assert!(r[4].y1 < 100.0);
    }

    #[test]
    fn block_rect_grows_a_block_by_its_extra_lines() {
        // Arrange
        let plain = block_rect(100.0, 100.0, 0, 0);

        // Act
        let emerg = block_rect(100.0, 100.0, 0, 1);

        // Assert
        assert!(emerg.y1 - emerg.y0 > plain.y1 - plain.y0);
        assert!((emerg.x1 - emerg.x0 - DB_WIDTH).abs() < 1e-9);
    }

    #[test]
    fn leader_is_the_same_length_from_the_glyph_edge_to_the_block_in_every_direction() {
        // Arrange
        let offsets: Vec<Vec2> = DIRS.iter().map(|&d| block_offset(d, 0)).collect();

        // Act
        let lengths: Vec<f64> = offsets
            .iter()
            .map(|o| {
                let (a, b) = leader(o.x, o.y, DB_HEIGHT);
                (b.x - a.x).hypot(b.y - a.y)
            })
            .collect();

        // Assert
        for l in lengths {
            assert!((l - LEADER_PX).abs() < 1e-6, "{l}");
        }
    }

    #[test]
    fn leader_runs_toward_a_dragged_block_wherever_it_is() {
        // Arrange
        let (dx, dy) = (-200.0, 50.0);

        // Act
        let (a, b) = leader(dx, dy, DB_HEIGHT);

        // Assert
        assert!(a.x < 0.0);
        assert!(b.x > dx + DB_WIDTH - 5.0);
        assert!(b.y < dy + 1.0);
    }
}
