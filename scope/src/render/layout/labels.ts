import type { Corner } from '../../state/track';

/** Data block footprint in CSS pixels: two lines of 11 px mono, twelve glyphs wide. */
const DB_WIDTH = 80;
export const DB_HEIGHT = 26;
export const DB_LINE = 12;
/** Half the glyph box; blocks must clear other targets' glyphs. */
const GLYPH_HALF = 8;

const CORNERS: readonly Corner[] = ['ne', 'nw', 'se', 'sw'];

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LabelSubject {
  hex: string;
  cx: number;
  cy: number;
  /** Lines beyond the standard two, such as the emergency prefix. */
  extraLines: number;
  pinnedCorner: Corner | null;
  autoCorner: Corner;
}

const OFFSETS: Record<Corner, { dx: number; dy: number }> = {
  ne: { dx: 22, dy: -18 },
  nw: { dx: -22, dy: -18 },
  se: { dx: 22, dy: 14 },
  sw: { dx: -22, dy: 14 },
};

/** Offset from the target to the block's near corner, in CSS pixels. */
export function labelOffset(corner: Corner): { dx: number; dy: number } {
  return OFFSETS[corner];
}

/** The corner a free offset from the target is closest to; used when a dragged block is released. */
export function nearestCorner(dx: number, dy: number): Corner {
  return `${dy < 0 || (dy === 0 && dx >= 0) ? 'n' : 's'}${dx >= 0 ? 'e' : 'w'}`;
}

/**
 * The rectangle a data block occupies. With the block above the target, extra
 * lines grow it upward so the two standard lines keep their distance.
 */
export function labelRect(cx: number, cy: number, corner: Corner, extraLines: number): Rect {
  const { dx, dy } = labelOffset(corner);
  const x0 = dx > 0 ? cx + dx : cx + dx - DB_WIDTH;
  const extra = extraLines * DB_LINE;
  const y0 = cy + dy - (dy < 0 ? extra : 0);
  return { x0, y0, x1: x0 + DB_WIDTH, y1: y0 + DB_HEIGHT + extra };
}

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Greedy corner assignment. Pinned blocks are placed first and never moved.
 * Automatic blocks try their current corner first, so an uncontested block
 * stays put. Upper targets pick first, as the eye reads the scope top-down.
 * When every corner collides, the least-overlapping one wins.
 */
export function placeLabels(subjects: readonly LabelSubject[]): Map<string, Corner> {
  const result = new Map<string, Corner>();
  const claimed: Rect[] = subjects.map((s) => ({
    x0: s.cx - GLYPH_HALF,
    y0: s.cy - GLYPH_HALF,
    x1: s.cx + GLYPH_HALF,
    y1: s.cy + GLYPH_HALF,
  }));
  const auto: LabelSubject[] = [];
  for (const s of subjects) {
    if (s.pinnedCorner) {
      claimed.push(labelRect(s.cx, s.cy, s.pinnedCorner, s.extraLines));
      result.set(s.hex, s.pinnedCorner);
    } else {
      auto.push(s);
    }
  }
  auto.sort((a, b) => a.cy - b.cy);
  for (const s of auto) {
    const order = [s.autoCorner, ...CORNERS.filter((c) => c !== s.autoCorner)];
    let best: Corner = s.autoCorner;
    let bestRect = labelRect(s.cx, s.cy, best, s.extraLines);
    let bestCost = Number.POSITIVE_INFINITY;
    for (const corner of order) {
      const r = labelRect(s.cx, s.cy, corner, s.extraLines);
      let cost = 0;
      for (const c of claimed) cost += overlap(r, c);
      if (cost < bestCost) {
        bestCost = cost;
        best = corner;
        bestRect = r;
      }
      if (cost === 0) break;
    }
    claimed.push(bestRect);
    result.set(s.hex, best);
  }
  return result;
}
