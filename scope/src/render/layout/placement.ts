import type { Altimeter } from '../../lib/altitude';
import type { Rect } from '../../lib/datablock';
import { type Vec2, velocityNm } from '../../lib/geo';
import { type Filter, visibility } from '../../state/filter';
import type { Sample, Track } from '../../state/track';
import type { View } from '../protocol';
import { extraLines } from '../scene/datablock';

/** What the placer knows of a track, in CSS px at the layout scale, y down. */
export interface Subject {
  hex: string;
  cx: number;
  cy: number;
  /** Velocity, px per second. */
  vx: number;
  vy: number;
  extraLines: number;
  /** Direction the block sits at; null for a track not yet placed. */
  dir: number | null;
  /** Seconds since the block last moved; Infinity when it never has. */
  sinceMove: number;
  /** Whether the operator placed the block where it sits. */
  manual: boolean;
  /** Feet; 0 on the ground, NaN when unknown. */
  altitudeFt: number;
  /** Degrees per second, a right turn positive; 0 when unknown. */
  turnRateDegPerSec: number;
  /** Position reports of the last 30 s, in the same px, newest first. */
  history: Vec2[];
}

/** The subjects to place and their scale. */
export interface Scene {
  subjects: readonly Subject[];
  /** The subjects' scale, to judge distances in miles. */
  pxPerNm: number;
}

export interface PlacementInput {
  tracks: Iterable<Track>;
  /** Snapshot time, seconds. */
  now: number;
  /** The scale the blocks are laid out at. */
  pxPerNm: number;
  filter: Filter;
  altimeter: Altimeter;
  selected: string | null;
  /** The canvas, in the px the subjects use. */
  viewport: Rect;
}

/** How far beyond the canvas a target can be and still have a block on it. */
const REACH_PX = 120;
/** How much of the position history the placer keeps clear of, whatever the trail shows. */
const HISTORY_SEC = 30;

/** Degrees per second between the last two samples that reported a track, wrapped; 0 without. */
function turnRate(samples: readonly Sample[]): number {
  const known = samples.filter((s) => s.track !== undefined).slice(-2);
  const [a, b] = known;
  if (!a || !b || a.track === undefined || b.track === undefined || b.t <= a.t) return 0;
  const turned = ((b.track - a.track + 540) % 360) - 180;
  return turned / (b.t - a.t);
}

/** The canvas in CSS px from the world origin at `pxPerNm`, y down, where a layout works. */
export function viewportRect(view: View, pxPerNm: number): Rect {
  const cx = view.centerX * pxPerNm;
  const cy = -view.centerY * pxPerNm;
  return {
    x0: cx - view.widthPx / 2,
    y0: cy - view.heightPx / 2,
    x1: cx + view.widthPx / 2,
    y1: cy + view.heightPx / 2,
  };
}

const onCanvas = (cx: number, cy: number, v: Rect) =>
  cx >= v.x0 - REACH_PX && cx <= v.x1 + REACH_PX && cy >= v.y0 - REACH_PX && cy <= v.y1 + REACH_PX;

/** What the placer sees of the tracks with a block on the canvas, in CSS px at the layout scale. */
export function blockSubjects(input: PlacementInput): Subject[] {
  const k = input.pxPerNm;
  const out: Subject[] = [];
  for (const t of input.tracks) {
    const p = t.position;
    if (p.kind !== 'live' && p.kind !== 'last') continue;
    if (visibility(t, input.selected, input.filter, input.altimeter) !== 'shown') continue;
    const cx = p.x * k;
    const cy = -p.y * k;
    if (!onCanvas(cx, cy, input.viewport)) continue;
    const v =
      t.gs !== undefined && t.track !== undefined ? velocityNm(t.gs, t.track) : { x: 0, y: 0 };
    out.push({
      hex: t.hex,
      cx,
      cy,
      vx: (v.x * k) / 3600,
      vy: (-v.y * k) / 3600,
      extraLines: extraLines(t),
      dir: t.ops.dir,
      sinceMove: t.ops.movedAt === null ? Infinity : input.now - t.ops.movedAt,
      manual: t.ops.manual,
      altitudeFt: typeof t.alt === 'number' ? t.alt : t.alt === 'ground' ? 0 : NaN,
      turnRateDegPerSec: turnRate(t.samples),
      history: t.history
        .filter((f) => f.t >= input.now - HISTORY_SEC)
        .map((f) => ({ x: f.x * k, y: -f.y * k }))
        .toReversed(),
    });
  }
  return out;
}

/** A block as the placer was sent it: where it sat and whether the operator put it there. */
export type Seen = Pick<Subject, 'hex' | 'dir' | 'manual'>;

/**
 * Puts the placer's bearings on the tracks: a block that moves notes when, and one the
 * operator placed is the placer's again once it moves. The bearings answer the scene as it
 * was sent, so a block the operator has moved since stands.
 */
export function applyPlacement(
  tracks: Iterable<Track>,
  dirs: ReadonlyMap<string, number>,
  now: number,
  sent: readonly Seen[],
): void {
  const seen = new Map(sent.map((s) => [s.hex, s]));
  for (const t of tracks) {
    const dir = dirs.get(t.hex);
    const was = seen.get(t.hex);
    if (dir === undefined || dir === t.ops.dir) continue;
    if (!was || was.dir !== t.ops.dir || was.manual !== t.ops.manual) continue;
    t.ops.dir = dir;
    t.ops.movedAt = now;
    t.ops.manual = false;
  }
}
