import type { Altimeter } from '../../lib/altitude';
import { blockDir, blockOffset } from '../../lib/datablock';
import { velocityNm } from '../../lib/geo';
import { type Filter, visibility, type Visibility } from '../../state/filter';
import type { Track } from '../../state/track';
import { type Move, moved, type Offset } from '../layout/moves';
import { decimateTrail } from '../layout/trails';
import { type AtlasInfo, type Batch, Shape } from '../protocol';
import { dataBlock, drawDataBlock, extraLines } from './datablock';
import { type Anchor, LineBatch, MarkerBatch, TextBatch } from './pack';
import { targetShape, THEME, trackColor } from './rules';

export interface TargetInput {
  tracks: Iterable<Track>;
  /** Snapshot time, seconds. */
  now: number;
  filter: Filter;
  vectorMin: number;
  trailSec: number;
  selected: string | null;
  /** A block being dragged: its top-left corner drawn at this offset from its target, CSS px. */
  labelDrag: LabelDrag | null;
  /** Blocks sliding to a new bearing, by hex, and the moment they are drawn at on their clock. */
  moves: ReadonlyMap<string, Move>;
  drawAt: number;
  altimeter: Altimeter;
  atlas: AtlasInfo;
}

export interface LabelDrag {
  hex: string;
  dx: number;
  dy: number;
}

/** Where a block rests from its target, at its bearing. */
export function restingOffset(t: Track): Offset {
  return blockOffset(blockDir(t.ops.dir), extraLines(t));
}

/**
 * Where a block is drawn from its target: with the drag while one is under way, along its
 * move while one is, else at its bearing.
 */
export function drawnOffset(
  t: Track,
  drag: LabelDrag | null,
  moves: ReadonlyMap<string, Move>,
  drawAt: number,
): Offset {
  if (drag && drag.hex === t.hex) return { dx: drag.dx, dy: drag.dy };
  const move = moves.get(t.hex);
  return move ? moved(move, drawAt) : restingOffset(t);
}

const GLYPH_PX = 6;
/** Fixed 45° slash, half-length in CSS px. */
const SLASH = 2.1;
const HISTORY_DOT_PX = 2.5;

interface Drawable {
  t: Track;
  x: number;
  y: number;
  visibility: Visibility;
  color: string;
}

function drawables(input: TargetInput): Drawable[] {
  const out: Drawable[] = [];
  for (const t of input.tracks) {
    const p = t.position;
    if (p.kind !== 'live' && p.kind !== 'last') continue;
    out.push({
      t,
      x: p.x,
      y: p.y,
      visibility: visibility(t, input.selected, input.filter, input.altimeter),
      color: trackColor(t, input.selected),
    });
  }
  return out;
}

function drawTrails(lines: LineBatch, d: Drawable, input: TargetInput): void {
  if (d.visibility === 'filtered') return;
  for (const f of decimateTrail(d.t.history, input.now, input.trailSec)) {
    lines.segment(
      { x: f.x, y: f.y, px: -SLASH, py: SLASH },
      { x: f.x, y: f.y, px: SLASH, py: -SLASH },
      d.color,
    );
  }
}

/** The selected target shows everything the store retained, one dot per fix. */
function drawHistory(markers: MarkerBatch, d: Drawable, input: TargetInput): void {
  if (d.t.hex !== input.selected) return;
  for (const f of d.t.history)
    markers.marker({ x: f.x, y: f.y }, Shape.Dot, HISTORY_DOT_PX, THEME.history);
}

function drawVector(lines: LineBatch, d: Drawable, input: TargetInput): void {
  if (d.visibility === 'filtered' || input.vectorMin <= 0) return;
  const { gs, track } = d.t;
  if (gs === undefined || track === undefined) return;
  const v = velocityNm(gs, track);
  const h = input.vectorMin / 60;
  lines.segment({ x: d.x, y: d.y }, { x: d.x + v.x * h, y: d.y + v.y * h }, d.color);
}

function drawSelection(lines: LineBatch, d: Drawable): void {
  const s = 10;
  const l = 3;
  const at = (px: number, py: number): Anchor => ({ x: d.x, y: d.y, px, py });
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    lines.segment(at(sx * s, sy * (s - l)), at(sx * s, sy * s), THEME.selbox);
    lines.segment(at(sx * s, sy * s), at(sx * (s - l), sy * s), THEME.selbox);
  }
}

/** The targets layer: glyphs, trails, vectors and data blocks at the bearings the placer set. */
export function buildTargets(input: TargetInput): Batch[] {
  const lines = new LineBatch();
  const markers = new MarkerBatch();
  const text = new TextBatch(input.atlas);
  const items = drawables(input);

  for (const d of items) drawHistory(markers, d, input);
  for (const d of items) drawTrails(lines, d, input);
  for (const d of items) drawVector(lines, d, input);
  for (const d of items) {
    const at: Anchor = { x: d.x, y: d.y };
    if (d.visibility === 'filtered') {
      markers.marker(at, Shape.HollowDiamond, 8, THEME.filtered);
      continue;
    }
    markers.marker(at, targetShape(d.t, d.visibility), GLYPH_PX, d.color);
    if (d.t.hex === input.selected) drawSelection(lines, d);
    drawDataBlock(lines, text, dataBlock(d.t, input.now, input.altimeter), {
      at,
      ...drawnOffset(d.t, input.labelDrag, input.moves, input.drawAt),
      color: d.color,
      emphasised: d.t.hex === input.selected,
    });
  }

  return [lines.finish(), markers.finish(), text.finish()];
}
