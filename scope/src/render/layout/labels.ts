import { blockRect, DIRECTIONS, GLYPH_HALF, NE } from '../../lib/datablock';
import { RectGrid } from './grid';

export interface LabelSubject {
  hex: string;
  cx: number;
  cy: number;
  /** Lines beyond the standard two, such as the emergency prefix. */
  extraLines: number;
  dir: number | null;
}

/**
 * Greedy assignment. Each block tries its current direction first, so an uncontested block
 * stays put, where the placer or a drag left it. Upper targets pick first, as the eye reads the
 * scope top-down. When every direction collides, the least-overlapping one wins.
 */
export function placeLabels(subjects: readonly LabelSubject[]): Map<string, number> {
  const result = new Map<string, number>();
  const claimed = new RectGrid();
  for (const s of subjects) {
    claimed.add({
      x0: s.cx - GLYPH_HALF,
      y0: s.cy - GLYPH_HALF,
      x1: s.cx + GLYPH_HALF,
      y1: s.cy + GLYPH_HALF,
    });
  }
  const all = Array.from({ length: DIRECTIONS }, (_, d) => d);
  for (const s of subjects.toSorted((a, b) => a.cy - b.cy)) {
    const current = s.dir ?? NE;
    const order = [current, ...all.filter((d) => d !== current)];
    let best = current;
    let bestRect = blockRect(s.cx, s.cy, best, s.extraLines);
    let bestCost = Number.POSITIVE_INFINITY;
    for (const dir of order) {
      const r = blockRect(s.cx, s.cy, dir, s.extraLines);
      const cost = claimed.overlapWith(r);
      if (cost < bestCost) {
        bestCost = cost;
        best = dir;
        bestRect = r;
      }
      if (cost === 0) break;
    }
    claimed.add(bestRect);
    result.set(s.hex, best);
  }
  return result;
}
