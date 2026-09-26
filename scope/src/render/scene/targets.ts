import type { Altimeter } from '../../lib/altitude';
import { velocityNm } from '../../lib/geo';
import { classify, type Filter, type Visibility } from '../../state/filter';
import type { Corner, Fix, Track } from '../../state/track';
import { DB_LINE, labelOffset, type LabelSubject, placeLabels } from '../layout/labels';
import { decimateTrail } from '../layout/trails';
import { type AtlasInfo, type Batch, Shape, type View } from '../protocol';
import { type Anchor, LineBatch, MarkerBatch, TextBatch } from './pack';
import { dataBlock, extraLines, targetShape, THEME, trackColor } from './rules';
import { toScreen } from './view';

export interface TargetInput {
  tracks: Iterable<Track>;
  /** Snapshot time, seconds. */
  now: number;
  filter: Filter;
  vectorMin: number;
  trailSec: number;
  selected: string | null;
  hovered: string | null;
  /** A block being dragged: drawn at this offset from its target, in CSS px. */
  labelDrag: LabelDrag | null;
  altimeter: Altimeter;
  /** Full-day trace of the selected target, if readsb keeps one. */
  trace: readonly Fix[] | null;
  view: View;
  atlas: AtlasInfo;
}

export interface LabelDrag {
  hex: string;
  dx: number;
  dy: number;
}

export interface TargetScene {
  batches: Batch[];
  /** Corner each automatic data block ended up in. */
  corners: Map<string, Corner>;
}

const FONT_PX = 11;
const GLYPH_PX = 6;
/** Fixed 45° slash, half-length in CSS px. */
const SLASH = 2.1;
const HISTORY_DOT_PX = 2.5;

function dim(hex: string, f: number): string {
  const n = Number.parseInt(hex.slice(1, 7), 16);
  const c = (v: number) =>
    Math.round(v * f)
      .toString(16)
      .padStart(2, '0');
  return `#${c((n >>> 16) & 255)}${c((n >>> 8) & 255)}${c(n & 255)}`;
}

interface Drawable {
  t: Track;
  x: number;
  y: number;
  cx: number;
  cy: number;
  visibility: Visibility;
  color: string;
}

function drawables(input: TargetInput): Drawable[] {
  const out: Drawable[] = [];
  for (const t of input.tracks) {
    const p = t.position;
    if (p.kind !== 'live' && p.kind !== 'last') continue;
    const { cx, cy } = toScreen(input.view, p.x, p.y);
    out.push({
      t,
      x: p.x,
      y: p.y,
      cx,
      cy,
      // Selecting a filtered target is the operator asking to see it in full.
      visibility: t.hex === input.selected ? 'shown' : classify(t, input.filter, input.altimeter),
      color: trackColor(t, input.selected),
    });
  }
  return out;
}

function drawTrails(lines: LineBatch, d: Drawable, input: TargetInput): void {
  if (d.visibility === 'filtered' || d.t.ops.hideTrail) return;
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
  for (const f of input.trace ?? []) {
    markers.marker({ x: f.x, y: f.y }, Shape.Dot, HISTORY_DOT_PX, THEME.history);
  }
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

function drawDataBlock(
  lines: LineBatch,
  text: TextBatch,
  d: Drawable,
  { dx, dy }: { dx: number; dy: number },
  input: TargetInput,
): void {
  const right = dx > 0;
  const above = dy < 0;
  const block = dataBlock(d.t, input.now, input.altimeter);
  const extra = above ? extraLines(d.t) * DB_LINE : 0;
  const blockY = dy - extra;
  const align = right ? 'left' : 'right';
  const emphasised = d.t.hex === input.selected || d.t.hex === input.hovered;
  const at: Anchor = { x: d.x, y: d.y };
  // Leader from the glyph edge to the block edge that faces the target.
  lines.segment(
    { ...at, px: right ? 3 : -3, py: above ? -3 : 3 },
    { ...at, px: right ? dx - 3 : dx + 3, py: above ? dy + 13 : blockY - 3 },
    emphasised ? d.color : dim(d.color, 0.5),
  );
  let lineY = blockY;
  if (block.prefix) {
    text.text(block.prefix, { ...at, px: dx, py: lineY }, FONT_PX, THEME.emergency, { align });
    lineY += DB_LINE;
  }
  text.text(block.line1, { ...at, px: dx, py: lineY }, FONT_PX, d.color, { align });
  text.text(block.line2, { ...at, px: dx, py: lineY + DB_LINE }, FONT_PX, d.color, { align });
}

export function buildTargets(input: TargetInput): TargetScene {
  const lines = new LineBatch();
  const markers = new MarkerBatch();
  const text = new TextBatch(input.atlas);
  const items = drawables(input);

  const subjects: LabelSubject[] = items
    .filter((d) => d.visibility === 'shown')
    .map((d) => ({
      hex: d.t.hex,
      cx: d.cx,
      cy: d.cy,
      extraLines: extraLines(d.t),
      pinnedCorner: d.t.ops.pinnedCorner,
      autoCorner: d.t.ops.autoCorner,
    }));
  const corners = placeLabels(subjects);

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
    else if (d.t.hex === input.hovered) markers.marker(at, Shape.HollowSquare, 14, THEME.hover);
    const drag = input.labelDrag;
    const offset = drag && drag.hex === d.t.hex ? drag : labelOffset(corners.get(d.t.hex) ?? 'ne');
    drawDataBlock(lines, text, d, offset, input);
  }

  return { batches: [lines.finish(), markers.finish(), text.finish()], corners };
}
