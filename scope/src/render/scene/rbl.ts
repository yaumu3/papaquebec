import { formatMmSs } from '../../lib/format';
import type { GeoPoint, ProjectFn, UnprojectFn, Vec2 } from '../../lib/geo';
import { geodesicPath } from '../../lib/geodesic';
import type { Declination } from '../../lib/wmm';
import type { RblAnchor } from '../../state/scope';
import type { Track } from '../../state/track';
import { Shape } from '../protocol';
import type { Anchor, LineBatch, MarkerBatch, TextBatch } from './pack';
import {
  drawAtPointer,
  drawStack,
  figures,
  freePoint,
  measure,
  nameLine,
  type Point,
  rangeBearing,
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

/** An RBL is dotted, so it reads as a measure and not a track: px on, px off. */
const RBL_DASH: [number, number] = [1, 3];

/** What an RBL is drawn with, beside its batches. */
export interface RblDrawing {
  /** Lat/lon onto the scope plane, for lines drawn along the geodesic. */
  project: ProjectFn;
  /** The declination where a bearing is measured, degrees east. */
  declination: Declination;
}

export function drawRbl(
  lines: LineBatch,
  markers: MarkerBatch,
  text: TextBatch,
  a: Point,
  b: Point,
  onTarget: [boolean, boolean],
  tag: string,
  labelAt: Anchor,
  input: RblDrawing,
): void {
  lines.polyline(rblPath(a, b, input.project), THEME.cursor, { dash: RBL_DASH });
  markers.marker(a.pos, onTarget[0] ? Shape.Square : Shape.HollowSquare, 6, THEME.cursor);
  markers.marker(b.pos, onTarget[1] ? Shape.Square : Shape.HollowSquare, 6, THEME.cursor);
  drawStack(text, [nameLine(tag), ...figures(rblLines(a, b, input.declination))], labelAt);
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
  markers.marker(a.pos, aOnTarget ? Shape.Square : Shape.HollowSquare, 6, THEME.cursor);
  drawAtPointer(lines, text, pointer, figures(rblLines(a, b, input.declination)));
}
