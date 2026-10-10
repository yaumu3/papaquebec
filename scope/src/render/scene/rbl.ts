import { formatMmSs } from '../../lib/format';
import {
  type Span,
  splitByCircle,
  type GeoPoint,
  type ProjectFn,
  type UnprojectFn,
  type Vec2,
} from '../../lib/geo';
import { geodesicPath } from '../../lib/geodesic';
import type { Declination } from '../../lib/wmm';
import type { RblAnchor } from '../../state/scope';
import type { Track } from '../../state/track';
import { Shape, type View } from '../protocol';
import type { LineBatch, MarkerBatch, TextBatch } from './pack';
import {
  type Box,
  drawAtPointer,
  drawStack,
  figures,
  freePoint,
  measure,
  nameLine,
  type Point,
  rangeBearing,
  stackBox,
  trackPoint,
} from './readout';
import { THEME } from './rules';

/** Where an RBL end is: on its target while it has a position, else where it was placed. */
export function anchorPoint(
  a: RblAnchor,
  ends: { tracks: Map<string, Track>; unproject: UnprojectFn },
): Point | null {
  if (a.kind === 'target') {
    const t = ends.tracks.get(a.hex);
    return t ? trackPoint(t) : null;
  }
  return freePoint({ x: a.x, y: a.y }, '', ends.unproject);
}

/** The line an RBL is drawn along, on the scope plane; hit tests follow the same one. */
export function rblPath(a: { geo: GeoPoint }, b: { geo: GeoPoint }, project: ProjectFn): Vec2[] {
  return geodesicPath([a.geo, b.geo], project);
}

/** Distance, magnetic bearing, then ETE when only A moves. */
export function rblLines(a: Point, b: Point, declination: Declination): string[] {
  const { dist, brg } = measure(a, b, declination);
  const lines = rangeBearing(dist, brg);
  if (a.vel && !b.vel) {
    const gs = Math.hypot(a.vel.x, a.vel.y);
    if (gs > 1) lines.push(formatMmSs((dist / gs) * 3600));
  }
  return lines;
}

/** How far past its readout an RBL stays faint, CSS px. */
const READOUT_MARGIN_PX = 4;
/** An RBL is dotted, so it reads as a measure and not a track: px on, px off. */
const RBL_DASH: [number, number] = [1, 3];
/** Size of the square that marks an RBL end, CSS px. */
const END_PX = 6;
/** Length of each side of the triangle that points an RBL from A to B, CSS px. */
const ARROW_PX = 7;
const ARROW_SPREAD = Math.PI / 6;

/** A point on a drawn path, and which way the path runs there. */
interface PathSite {
  /** Where it is on the scope plane. */
  at: Vec2;
  /** The line's direction there on screen, y down, of unit length. */
  dir: Vec2;
}

/** The middle of a drawn path, or its far end. */
function siteOn(path: Vec2[], where: 'middle' | 'end'): PathSite {
  const last = path.length - 1;
  const m = where === 'end' ? last : last / 2;
  const p = path[Math.floor(m)] ?? { x: 0, y: 0 };
  const q = path[Math.ceil(m)] ?? p;
  const before = path[Math.floor(m) - 1] ?? p;
  const after = path[Math.ceil(m) + 1] ?? q;
  const dx = after.x - before.x;
  const dy = before.y - after.y;
  const len = Math.hypot(dx, dy) || 1;
  return { at: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, dir: { x: dx / len, y: dy / len } };
}

/** Px along the line from a readout's centre to the edge of its box, plus `pad`. */
function reachAlong(dir: Vec2, box: Box, pad: number): number {
  const x = dir.x === 0 ? Infinity : box.w / 2 / Math.abs(dir.x);
  const y = dir.y === 0 ? Infinity : box.h / 2 / Math.abs(dir.y);
  return Math.min(x, y) + pad;
}

/** The spans of a path that lie further than `r` from `c`. */
function clearOf(path: Vec2[], c: Vec2, r: number): Span[] {
  return path.slice(1).flatMap((q, i) => splitByCircle(path[i] ?? q, q, c, r).outside);
}

/** The dotted spans, faint within `reach` of `c` where the readout sits, so the text stays clear. */
function drawFadingAt(lines: LineBatch, spans: Span[], c: Vec2, reach: number): void {
  const parts = spans.map(([p, q]) => splitByCircle(p, q, c, reach));
  for (const [p, q] of parts.flatMap((s) => s.outside))
    lines.segment(p, q, THEME.cursor, { dash: RBL_DASH });
  for (const [p, q] of parts.flatMap((s) => s.inside))
    lines.segment(p, q, THEME.cursorFaint, { dash: RBL_DASH });
}

/** A hollow triangle with its tip `tipPx` along the line from `site`, pointing the way it runs. */
function drawArrow(lines: LineBatch, site: PathSite, tipPx: number): void {
  const tip = { ...site.at, px: site.dir.x * tipPx, py: site.dir.y * tipPx };
  const corner = (turn: number) => {
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    return {
      ...site.at,
      px: tip.px - ARROW_PX * (site.dir.x * c - site.dir.y * s),
      py: tip.py - ARROW_PX * (site.dir.x * s + site.dir.y * c),
    };
  };
  const above = corner(ARROW_SPREAD);
  const below = corner(-ARROW_SPREAD);
  lines.segment(tip, above, THEME.cursor);
  lines.segment(tip, below, THEME.cursor);
  lines.segment(above, below, THEME.cursor);
}

/** What an RBL is drawn with, beside its batches. */
export interface RblDrawing {
  /** Lat/lon onto the scope plane, for lines drawn along the geodesic. */
  project: ProjectFn;
  /** The declination where a bearing is measured, degrees east. */
  declination: Declination;
  view: View;
}

export function drawRbl(
  lines: LineBatch,
  markers: MarkerBatch,
  text: TextBatch,
  a: Point,
  b: Point,
  onTarget: [boolean, boolean],
  tag: string,
  input: RblDrawing,
): void {
  const path = rblPath(a, b, input.project);
  const site = siteOn(path, 'middle');
  const stack = [nameLine(tag), ...figures(rblLines(a, b, input.declination))];
  const box = stackBox(text, stack);
  const reach = reachAlong(site.dir, box, READOUT_MARGIN_PX);
  const end = siteOn(path, 'end');
  const tipPx = reachAlong(end.dir, { w: END_PX, h: END_PX }, 1);
  const basePx = tipPx + ARROW_PX * Math.cos(ARROW_SPREAD);
  const spans = clearOf(path, end.at, basePx / input.view.pxPerNm);
  drawFadingAt(lines, spans, site.at, reach / input.view.pxPerNm);
  drawArrow(lines, end, -tipPx);
  markers.marker(a.pos, onTarget[0] ? Shape.Square : Shape.HollowSquare, END_PX, THEME.cursor);
  markers.marker(b.pos, onTarget[1] ? Shape.Square : Shape.HollowSquare, END_PX, THEME.cursor);
  drawStack(text, stack, { ...site.at, px: -box.w / 2, py: -box.h / 2 });
}

/** An RBL being placed: its line to the pointer, read there as the range cursor reads. */
export function drawPendingRbl(
  lines: LineBatch,
  markers: MarkerBatch,
  text: TextBatch,
  a: Point,
  b: Point,
  aOnTarget: boolean,
  pointer: Vec2,
  input: RblDrawing,
): void {
  lines.polyline(rblPath(a, b, input.project), THEME.cursor, { dash: RBL_DASH });
  markers.marker(a.pos, aOnTarget ? Shape.Square : Shape.HollowSquare, END_PX, THEME.cursor);
  drawAtPointer(lines, text, pointer, figures(rblLines(a, b, input.declination)));
}
