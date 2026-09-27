import { formatMmSs, padBearing } from '../../lib/format';
import {
  closestApproach,
  type GeoPoint,
  trueToMagnetic,
  type Vec2,
  velocityNm,
} from '../../lib/geo';
import { inverse } from '../../lib/geodesic';
import type { RangeCursorOrigin, Rbl, RblAnchor, RblPending } from '../../state/scope';
import type { Track } from '../../state/track';
import type { UnprojectFn } from '../../state/trackStore';
import { type AtlasInfo, type Batch, Shape, type View } from '../protocol';
import { type Anchor, LineBatch, MarkerBatch, TextBatch } from './pack';
import { THEME, trackLabel } from './rules';
import { toWorld } from './view';

export interface OverlayInput {
  tracks: Map<string, Track>;
  rbls: readonly Rbl[];
  rblPending: RblPending | null;
  rangeCursor: RangeCursorOrigin | null;
  /** Where a hovering or dragging pointer is, in screen px. */
  pointer: { cx: number; cy: number } | null;
  /** Magnetic declination at the site, degrees east. */
  declination: number;
  /** The scope plane back to lat/lon, for ends that are not targets. */
  unproject: UnprojectFn;
  view: View;
  atlas: AtlasInfo;
  /** Snaps a screen point to a target, if one is close. */
  snap: (cx: number, cy: number) => Track | null;
}

interface Point {
  /** Where it is drawn on the scope plane. */
  pos: Vec2;
  /** Where it is on the earth, which readouts measure between. */
  geo: GeoPoint;
  vel: Vec2 | null;
  label: string;
}

function trackPoint(t: Track): Point | null {
  const p = t.position;
  if (p.kind !== 'live' && p.kind !== 'last') return null;
  const vel = t.gs !== undefined && t.track !== undefined ? velocityNm(t.gs, t.track) : null;
  return { pos: { x: p.x, y: p.y }, geo: { lat: p.lat, lon: p.lon }, vel, label: trackLabel(t) };
}

/** A still point placed on the scope plane rather than reported by a target. */
function freePoint(pos: Vec2, label: string, unproject: UnprojectFn): Point {
  return { pos, geo: unproject(pos.x, pos.y), vel: null, label };
}

function anchorPoint(a: RblAnchor, input: OverlayInput): Point | null {
  if (a.kind === 'target') {
    const t = input.tracks.get(a.hex);
    return t ? trackPoint(t) : null;
  }
  return freePoint({ x: a.x, y: a.y }, '', input.unproject);
}

function mousePoint(input: OverlayInput): Point | null {
  if (!input.pointer) return null;
  const snapped = input.snap(input.pointer.cx, input.pointer.cy);
  if (snapped) return trackPoint(snapped);
  return freePoint(toWorld(input.view, input.pointer.cx, input.pointer.cy), '', input.unproject);
}

/** How far `b` lies from `a` along the geodesic, in NM, and on what initial magnetic bearing. */
function measure(a: Point, b: Point, declination: number): { dist: number; brg: number } {
  const r = inverse(a.geo, b.geo);
  return { dist: r.distanceNm, brg: trueToMagnetic(r.bearingTrue, declination) };
}

/** Distance, magnetic bearing, ETE when only A moves, CPA when both move. */
export function rblLines(a: Point, b: Point, declination: number): string[] {
  const { dist, brg } = measure(a, b, declination);
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
  if (!origin || !input.pointer) return;
  let from: Point | null;
  if (origin.kind === 'target') {
    const t = input.tracks.get(origin.hex);
    from = t ? trackPoint(t) : null;
  } else {
    const label =
      origin.kind === 'fix' ? origin.name : `${origin.x.toFixed(1)}, ${origin.y.toFixed(1)}`;
    from = freePoint({ x: origin.x, y: origin.y }, label, input.unproject);
  }
  if (!from) return;
  const o = from.pos;
  const m = toWorld(input.view, input.pointer.cx, input.pointer.cy);
  const { dist, brg } = measure(from, freePoint(m, '', input.unproject), input.declination);
  lines.segment(o, m, THEME.cursor, { dash: [2, 3] });
  markers.marker(o, Shape.Ring, 8, THEME.cursor);
  markers.marker(o, Shape.Dot, 4, THEME.cursor);
  lines.segment({ ...m, px: -8 }, { ...m, px: 8 }, THEME.cursor);
  lines.segment({ ...m, py: -8 }, { ...m, py: 8 }, THEME.cursor);
  text.text(`${dist.toFixed(1)} NM`, { ...m, px: 12, py: 6 }, 11, THEME.cursor);
  text.text(`${padBearing(brg)}°`, { ...m, px: 12, py: 19 }, 11, THEME.cursor);
  text.text(from.label, { ...m, px: 12, py: 32 }, 10, THEME.cursorDim);
}

export function buildOverlays(input: OverlayInput): Batch[] {
  const lines = new LineBatch();
  const markers = new MarkerBatch();
  const text = new TextBatch(input.atlas);

  for (const rbl of input.rbls) {
    const a = anchorPoint(rbl.a, input);
    const b = anchorPoint(rbl.b, input);
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
    const a = anchorPoint(pending, input);
    const b = mousePoint(input);
    if (a && b && input.pointer) {
      const w = toWorld(input.view, input.pointer.cx, input.pointer.cy);
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
