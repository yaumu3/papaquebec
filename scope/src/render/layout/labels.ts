import type { Vec2 } from '../../lib/geo';
import type { OperatorState } from '../../state/track';
import { type Rect, RectGrid } from './grid';

/** Data block type size and footprint in CSS pixels: two lines of mono, twelve glyphs wide. */
export const DB_FONT_PX = 11;
export const DB_WIDTH = 80;
export const DB_HEIGHT = 26;
export const DB_LINE = 12;
/** Half the box round a target glyph that blocks keep clear of. */
const GLYPH_HALF = 8;
/** Half the drawn glyph, where a leader starts. */
const SYMBOL_HALF = 3;
/** A leader's length, glyph edge to block, the same in every direction. */
export const LEADER_PX = 20;
/** The gap a leader leaves before the block. */
const GAP_PX = 3;

/** The bearings a block can sit at: 0 east, then clockwise on screen, so 2 is south and 6 north. */
export const DIRECTIONS = 8;
export const NE = 7;
const STEPS: readonly Vec2[] = [0, 1, 2, 3, 4, 5, 6, 7].map((d) => ({
  x: Math.round(Math.cos((d * Math.PI) / 4)),
  y: Math.round(Math.sin((d * Math.PI) / 4)),
}));

/** The step a direction takes on screen, each part -1, 0 or 1. */
function step(dir: number): Vec2 {
  const s = STEPS[dir];
  if (!s) throw new RangeError(`no direction ${dir}`);
  return s;
}

export interface LabelSubject {
  hex: string;
  cx: number;
  cy: number;
  /** Lines beyond the standard two, such as the emergency prefix. */
  extraLines: number;
  dir: number | null;
}

/** The direction a block sits at, north-east until it has been placed. */
export function blockDir(ops: Pick<OperatorState, 'dir'>): number {
  return ops.dir ?? NE;
}

export function blockHeight(extraLines: number): number {
  return DB_HEIGHT + extraLines * DB_LINE;
}

/** Where a leader along `u` leaves the glyph: the square's edge, so its corner on the diagonals. */
const glyphEdge = (u: Vec2) => SYMBOL_HALF / Math.max(Math.abs(u.x), Math.abs(u.y));

/**
 * Offset from the target to the top-left corner of a block at `dir`. The block's nearest point
 * lies on the direction's ray at the leader's end: beside the target the block is centred on
 * the leader, elsewhere its corner is at the tip, so the text reads away from the leader.
 */
export function blockOffset(dir: number, extraLines: number): { dx: number; dy: number } {
  const s = step(dir);
  const n = Math.hypot(s.x, s.y);
  const u = { x: s.x / n, y: s.y / n };
  const reach = glyphEdge(u) + LEADER_PX + GAP_PX;
  const h = blockHeight(extraLines);
  return {
    dx: u.x * reach - (s.x < 0 ? DB_WIDTH : 0),
    dy: u.y * reach - (s.y < 0 ? h : s.y === 0 ? h / 2 : 0),
  };
}

/** The rectangle a block of `extraLines` beyond the standard two occupies at `dir` from a target. */
export function blockRect(cx: number, cy: number, dir: number, extraLines: number): Rect {
  const { dx, dy } = blockOffset(dir, extraLines);
  return {
    x0: cx + dx,
    y0: cy + dy,
    x1: cx + dx + DB_WIDTH,
    y1: cy + dy + blockHeight(extraLines),
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Where the leader meets a block whose top-left corner is at `dx, dy`: its nearest point. */
export function leaderTip(dx: number, dy: number, heightPx: number): Vec2 {
  return { x: clamp(0, dx, dx + DB_WIDTH), y: clamp(0, dy, dy + heightPx) };
}

/**
 * The leader to a block whose top-left corner is at `dx, dy` from the target, in CSS px from
 * the target: from the glyph's edge toward the block's nearest point, stopping short by the gap.
 */
export function leader(dx: number, dy: number, heightPx: number): { a: Vec2; b: Vec2 } {
  const p = leaderTip(dx, dy, heightPx);
  const n = Math.hypot(p.x, p.y);
  if (n === 0) return { a: { x: 0, y: 0 }, b: { x: 0, y: 0 } };
  const u = { x: p.x / n, y: p.y / n };
  const start = glyphEdge(u);
  return {
    a: { x: u.x * start, y: u.y * start },
    b: { x: p.x - u.x * GAP_PX, y: p.y - u.y * GAP_PX },
  };
}

/**
 * The direction a released block at `dx, dy` moves to: where its leader points, so a cardinal
 * while the leader is straight and the diagonal once it tilts. North-east when the block covers
 * the target and the leader has no direction.
 */
export function leaderDir(dx: number, dy: number, extraLines: number): number {
  const p = leaderTip(dx, dy, blockHeight(extraLines));
  const dir = STEPS.findIndex((s) => s.x === Math.sign(p.x) && s.y === Math.sign(p.y));
  return dir === -1 ? NE : dir;
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
  for (const s of subjects.toSorted((a, b) => a.cy - b.cy)) {
    const current = s.dir ?? NE;
    const order = [current, ...[...STEPS.keys()].filter((d) => d !== current)];
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
