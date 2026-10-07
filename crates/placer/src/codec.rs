//! The scene as the scope sends it across the WebAssembly boundary: one flat array of numbers.

use crate::cost::Subject;
use crate::geometry::Vec2;

/// Numbers per subject before the histories: position, velocity, extra lines, direction
/// (-1 unplaced), seconds since the move, manual, altitude, turn rate, history length.
const FIELDS: usize = 11;

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn count(n: f64) -> usize {
    n.max(0.0) as usize
}

/// The subjects from the flat array: a count, then `FIELDS` numbers each, then every history
/// as x, y pairs newest first, subject after subject.
#[must_use]
pub fn decode(flat: &[f64]) -> Vec<Subject> {
    let n = flat.first().map_or(0, |&n| count(n));
    let mut history = &flat[1 + n * FIELDS..];
    (0..n)
        .map(|i| {
            let f = &flat[1 + i * FIELDS..=(i + 1) * FIELDS];
            let points = count(f[10]);
            let (mine, rest) = history.split_at(points * 2);
            history = rest;
            Subject {
                cx: f[0],
                cy: f[1],
                vx: f[2],
                vy: f[3],
                extra_lines: u32::try_from(count(f[4])).unwrap_or(0),
                dir: (f[5] >= 0.0).then(|| count(f[5])),
                since_move: f[6],
                manual: f[7] != 0.0,
                altitude_ft: f[8],
                turn_rate_deg_per_sec: f[9],
                history: mine
                    .as_chunks::<2>()
                    .0
                    .iter()
                    .map(|p| Vec2::new(p[0], p[1]))
                    .collect(),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_each_subject_and_its_history_from_the_flat_array() {
        // Arrange
        let flat = [
            2.0, // two subjects
            // cx, cy, vx, vy, extra lines, dir, since move, manual, altitude, turn rate, history points
            10.0,
            20.0,
            1.0,
            -1.0,
            1.0,
            3.0,
            12.5,
            1.0,
            5000.0,
            0.5,
            2.0, //
            30.0,
            40.0,
            0.0,
            0.0,
            0.0,
            -1.0,
            f64::INFINITY,
            0.0,
            f64::NAN,
            0.0,
            0.0, //
            9.0,
            19.0,
            8.0,
            18.0, // the first subject's history, newest first
        ];

        // Act
        let subjects = decode(&flat);

        // Assert
        assert_eq!(subjects.len(), 2);
        let a = &subjects[0];
        assert_eq!((a.cx, a.cy, a.vx, a.vy), (10.0, 20.0, 1.0, -1.0));
        assert_eq!(
            (a.extra_lines, a.dir, a.since_move, a.manual),
            (1, Some(3), 12.5, true)
        );
        assert_eq!((a.altitude_ft, a.turn_rate_deg_per_sec), (5000.0, 0.5));
        assert_eq!(a.history, [Vec2::new(9.0, 19.0), Vec2::new(8.0, 18.0)]);
        let b = &subjects[1];
        assert_eq!(
            (b.dir, b.since_move, b.manual),
            (None, f64::INFINITY, false)
        );
        assert!(b.altitude_ft.is_nan());
        assert!(b.history.is_empty());
    }
}
