import { formatMmSs, padBearing } from '../../lib/format';
import type { GeoPoint, ProjectFn, UnprojectFn, Vec2 } from '../../lib/geo';
import { geodesicPath } from '../../lib/geodesic';
import type { Declination } from '../../lib/wmm';
import type { RblAnchor } from '../../state/scope';
import type { Track } from '../../state/track';
import { Shape } from '../protocol';
import type { Anchor, LineBatch, MarkerBatch, TextBatch } from './pack';
import { freePoint, measure, type Point, trackPoint } from './readout';
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

/** Distance and magnetic bearing, then ETE when only A moves. */
export function rblLines(a: Point, b: Point, declination: Declination): string[] {
  const { dist, brg } = measure(a, b, declination);
  let first = `${dist.toFixed(1)} / ${padBearing(brg)}°`;
  const lines = [first];
  if (a.vel && !b.vel) {
    const gs = Math.hypot(a.vel.x, a.vel.y);
    if (gs > 1) first = `${first} / ${formatMmSs((dist / gs) * 3600)}`;
    lines[0] = first;
  }
  return lines;
}

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
  tag: string | null,
  labelAt: Anchor,
  input: RblDrawing,
): void {
  lines.polyline(rblPath(a, b, input.project), THEME.cursor);
  markers.marker(a.pos, onTarget[0] ? Shape.Square : Shape.HollowSquare, 6, THEME.cursor);
  if (tag !== null)
    markers.marker(b.pos, onTarget[1] ? Shape.Square : Shape.HollowSquare, 6, THEME.cursor);
  rblLines(a, b, input.declination).forEach((line, i) => {
    text.text(line, { ...labelAt, py: (labelAt.py ?? 0) + i * 13 }, 11, THEME.cursor);
  });
  if (tag !== null)
    text.text(tag, { ...a.pos, px: -10, py: -10 }, 11, THEME.cursor, {
      align: 'right',
      baseline: 'bottom',
    });
}
