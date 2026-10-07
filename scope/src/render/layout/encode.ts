import type { Scene } from './placement';

/** Numbers per subject before the histories, as the placer crate's codec reads them. */
const FIELDS = 11;

/**
 * The scene as one flat array for the placer: a count, then `FIELDS` numbers a subject, then
 * every history as x, y pairs newest first, subject after subject.
 */
export function encodeScene(scene: Scene): Float64Array {
  const { subjects } = scene;
  const points = subjects.reduce((n, s) => n + s.history.length, 0);
  const out = new Float64Array(1 + subjects.length * FIELDS + points * 2);
  out[0] = subjects.length;
  let at = 1;
  let point = 1 + subjects.length * FIELDS;
  for (const s of subjects) {
    out.set(
      [
        s.cx,
        s.cy,
        s.vx,
        s.vy,
        s.extraLines,
        s.dir ?? -1,
        s.sinceMove,
        s.manual ? 1 : 0,
        s.altitudeFt,
        s.turnRateDegPerSec,
        s.history.length,
      ],
      at,
    );
    at += FIELDS;
    for (const p of s.history) {
      out[point++] = p.x;
      out[point++] = p.y;
    }
  }
  return out;
}
