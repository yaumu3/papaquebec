import { formatMmSs, padBearing } from '../../lib/format';
import {
  bearingTrue,
  closestApproach,
  distanceNm,
  trueToMagnetic,
  type Vec2,
  velocityNm,
} from '../../lib/geo';
import type { RangeCursorOrigin, Rbl, RblAnchor, RblPending } from '../../state/scope';
import type { Track } from '../../state/track';
import { type AtlasInfo, type Batch, Shape, type View } from '../protocol';
import { type Anchor, LineBatch, MarkerBatch, TextBatch } from './pack';
import { THEME, trackLabel } from './rules';
import { toWorld } from './view';

export interface OverlayInput {
  tracks: Map<string, Track>;
  rbls: readonly Rbl[];
  rblPending: RblPending | null;
  rangeCursor: RangeCursorOrigin | null;
  mouse: { cx: number; cy: number } | null;
  /** Magnetic declination at the site, degrees east. */
  declination: number;
  view: View;
  atlas: AtlasInfo;
  /** Snaps a screen point to a target, if one is close. */
  snap: (cx: number, cy: number) => Track | null;
}

interface Point {
  pos: Vec2;
  vel: Vec2 | null;
  label: string;
}

function trackPoint(t: Track): Point | null {
  const p = t.position;
  if (p.kind !== 'live' && p.kind !== 'last') return null;
  const vel = t.gs !== undefined && t.track !== undefined ? velocityNm(t.gs, t.track) : null;
  return { pos: { x: p.x, y: p.y }, vel, label: trackLabel(t) };
}

function anchorPoint(a: RblAnchor, tracks: Map<string, Track>): Point | null {
  if (a.kind === 'target') {
    const t = tracks.get(a.hex);
    return t ? trackPoint(t) : null;
  }
  return { pos: { x: a.x, y: a.y }, vel: null, label: '' };
}

function mousePoint(input: OverlayInput): Point | null {
  if (!input.mouse) return null;
  const snapped = input.snap(input.mouse.cx, input.mouse.cy);
  if (snapped) return trackPoint(snapped);
  const w = toWorld(input.view, input.mouse.cx, input.mouse.cy);
  return { pos: w, vel: null, label: '' };
}

/** Distance, magnetic bearing, ETE when only A moves, CPA when both move. */
export function rblLines(a: Point, b: Point, declination: number): string[] {
  const dist = distanceNm(a.pos, b.pos);
  const brg = trueToMagnetic(bearingTrue(b.pos.x - a.pos.x, b.pos.y - a.pos.y), declination);
  let first = `${dist.toFixed(1)} / ${padBearing(brg)}°`;
  const lines = [first];
  if (a.vel && !b.vel) {
    const gs = Math.hypot(a.vel.x, a.vel.y);
    if (gs > 1) first = `${first} / ${formatMmSs((dist / gs) * 3600)}`;
    lines[0] = first;
  } else if (a.vel && b.vel) {
    const r = closestApproach({ pos: a.pos, vel: a.vel }, { pos: b.pos, vel: b.vel });
    if (r.kind === 'diverging') lines.push('DIV');
    else if (r.kind === 'co-speed') lines.push(`SEP ${r.distanceNm.toFixed(1)}`);
    else lines.push(`CPA ${r.distanceNm.toFixed(1)} in ${formatMmSs(r.seconds)}`);
  }
  return lines;
}

function drawRbl(
  lines: LineBatch,
  markers: MarkerBatch,
  text: TextBatch,
  a: Point,
  b: Point,
  onTarget: [boolean, boolean],
  tag: string | null,
  labelAt: Anchor,
  declination: number,
): void {
  lines.segment(a.pos, b.pos, THEME.cursor);
  markers.marker(a.pos, onTarget[0] ? Shape.Square : Shape.HollowSquare, 6, THEME.cursor);
  if (tag !== null)
    markers.marker(b.pos, onTarget[1] ? Shape.Square : Shape.HollowSquare, 6, THEME.cursor);
  rblLines(a, b, declination).forEach((line, i) => {
    text.text(line, { ...labelAt, py: (labelAt.py ?? 0) + i * 13 }, 11, THEME.cursor);
  });
  if (tag !== null)
    text.text(tag, { ...a.pos, px: -10, py: -10 }, 11, THEME.cursor, {
      align: 'right',
      baseline: 'bottom',
    });
}

function drawRangeCursor(
  lines: LineBatch,
  markers: MarkerBatch,
  text: TextBatch,
  input: OverlayInput,
): void {
  const origin = input.rangeCursor;
  if (!origin || !input.mouse) return;
  let o: Vec2;
  let label: string;
  if (origin.kind === 'target') {
    const t = input.tracks.get(origin.hex);
    const p = t ? trackPoint(t) : null;
    if (!p) return;
    o = p.pos;
    label = p.label;
  } else {
    o = { x: origin.x, y: origin.y };
    label = origin.kind === 'fix' ? origin.name : `${origin.x.toFixed(1)}, ${origin.y.toFixed(1)}`;
  }
  const m = toWorld(input.view, input.mouse.cx, input.mouse.cy);
  const dist = distanceNm(o, m);
  const brg = trueToMagnetic(bearingTrue(m.x - o.x, m.y - o.y), input.declination);
  lines.segment(o, m, THEME.cursor, { dash: [2, 3] });
  markers.marker(o, Shape.Ring, 8, THEME.cursor);
  markers.marker(o, Shape.Dot, 4, THEME.cursor);
  lines.segment({ ...m, px: -8 }, { ...m, px: 8 }, THEME.cursor);
  lines.segment({ ...m, py: -8 }, { ...m, py: 8 }, THEME.cursor);
  text.text(`${dist.toFixed(1)} NM`, { ...m, px: 12, py: 6 }, 11, THEME.cursor);
  text.text(`${padBearing(brg)}°`, { ...m, px: 12, py: 19 }, 11, THEME.cursor);
  text.text(label, { ...m, px: 12, py: 32 }, 10, THEME.cursorDim);
}

export function buildOverlays(input: OverlayInput): Batch[] {
  const lines = new LineBatch();
  const markers = new MarkerBatch();
  const text = new TextBatch(input.atlas);

  for (const rbl of input.rbls) {
    const a = anchorPoint(rbl.a, input.tracks);
    const b = anchorPoint(rbl.b, input.tracks);
    if (!a || !b) continue;
    const mid: Anchor = { x: (a.pos.x + b.pos.x) / 2, y: (a.pos.y + b.pos.y) / 2, px: 6, py: -6 };
    drawRbl(
      lines,
      markers,
      text,
      a,
      b,
      [rbl.a.kind === 'target', rbl.b.kind === 'target'],
      rbl.tag,
      mid,
      input.declination,
    );
  }
  const pending = input.rblPending?.a;
  if (pending) {
    const a = anchorPoint(pending, input.tracks);
    const b = mousePoint(input);
    if (a && b && input.mouse) {
      const w = toWorld(input.view, input.mouse.cx, input.mouse.cy);
      drawRbl(
        lines,
        markers,
        text,
        a,
        b,
        [pending.kind === 'target', false],
        null,
        { ...w, px: 12, py: 12 },
        input.declination,
      );
    }
  }
  drawRangeCursor(lines, markers, text, input);
  return [lines.finish(), markers.finish(), text.finish()];
}
