//! The placement before the annealer, kept as the benchmark's baseline.

use crate::cost::Scene;
use crate::geometry::{DIRECTIONS, GLYPH_HALF, NE, Rect, block_rect, overlap};

/// Top-down, each block keeps its bearing if clear of the glyphs and of the blocks placed so
/// far, else takes the first clear one, else the least overlapped.
#[must_use]
pub fn place_greedy(scene: &Scene) -> Vec<usize> {
    let subjects = &scene.subjects;
    let mut claimed: Vec<Rect> = subjects
        .iter()
        .map(|s| Rect {
            x0: s.cx - GLYPH_HALF,
            y0: s.cy - GLYPH_HALF,
            x1: s.cx + GLYPH_HALF,
            y1: s.cy + GLYPH_HALF,
        })
        .collect();
    let mut order: Vec<usize> = (0..subjects.len()).collect();
    order.sort_by(|&a, &b| subjects[a].cy.total_cmp(&subjects[b].cy));
    let mut result = vec![NE; subjects.len()];
    for i in order {
        let s = &subjects[i];
        let current = s.dir.unwrap_or(NE);
        let mut best = current;
        let mut best_rect = block_rect(s.cx, s.cy, current, s.extra_lines);
        let mut best_cost = f64::INFINITY;
        for dir in std::iter::once(current).chain((0..DIRECTIONS).filter(|&d| d != current)) {
            let r = block_rect(s.cx, s.cy, dir, s.extra_lines);
            let cost: f64 = claimed.iter().map(|c| overlap(r, *c)).sum();
            if cost < best_cost {
                best_cost = cost;
                best = dir;
                best_rect = r;
            }
            if cost == 0.0 {
                break;
            }
        }
        claimed.push(best_rect);
        result[i] = best;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cost::Subject;

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
    fn leaves_an_uncontested_block_in_its_current_direction() {
        // Arrange
        let subjects = vec![Subject {
            dir: Some(3),
            ..subject(100.0, 100.0)
        }];

        // Act
        let placed = place_greedy(&scene(subjects));

        // Assert
        assert_eq!(placed, [3]);
    }

    #[test]
    fn moves_the_lower_of_two_colliding_blocks_to_a_free_direction() {
        // Arrange
        let subjects = vec![subject(100.0, 100.0), subject(100.0, 110.0)];

        // Act
        let placed = place_greedy(&scene(subjects));

        // Assert
        assert_eq!(placed[0], NE);
        assert_ne!(placed[1], NE);
    }
}
