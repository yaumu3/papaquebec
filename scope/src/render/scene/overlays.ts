import type { ProjectFn, UnprojectFn } from '../../lib/geo';
import { geodesicPath } from '../../lib/geodesic';
import type { Declination } from '../../lib/wmm';
import type { RangeCursorOrigin, Rbl, RblPending } from '../../state/scope';
import type { Track } from '../../state/track';
import { type AtlasInfo, type Batch, Shape, type View } from '../protocol';
import { type Anchor, LineBatch, MarkerBatch, TextBatch } from './pack';
import { anchorPoint, drawRbl } from './rbl';
import {
  drawAtPointer,
  freePoint,
  measure,
  type Point,
  rangeBearing,
  readoutOf,
  trackPoint,
} from './readout';
import { THEME } from './rules';
import { toWorld } from './view';

export interface OverlayInput {
  tracks: Map<string, Track>;
  rbls: readonly Rbl[];
  rblPending: RblPending | null;
  rangeCursor: RangeCursorOrigin | null;
  /** Where a hovering or dragging pointer is, in screen px. */
  pointer: { cx: number; cy: number } | null;
  /** The declination where a bearing is measured, degrees east. */
  declination: Declination;
  /** Lat/lon onto the scope plane, for lines drawn along the geodesic. */
  project: ProjectFn;
  /** The scope plane back to lat/lon, for ends that are not targets. */
  unproject: UnprojectFn;
  view: View;
  atlas: AtlasInfo;
  /** Snaps a screen point to a target, if one is close. */
  snap: (cx: number, cy: number) => Track | null;
}

function mousePoint(input: OverlayInput): Point | null {
  if (!input.pointer) return null;
  const snapped = input.snap(input.pointer.cx, input.pointer.cy);
  if (snapped) return trackPoint(snapped);
  return freePoint(toWorld(input.view, input.pointer.cx, input.pointer.cy), '', input.unproject);
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
  const to = freePoint(m, '', input.unproject);
  const { dist, brg } = measure(from, to, input.declination);
  lines.polyline(geodesicPath([from.geo, to.geo], input.project), THEME.cursor, { dash: [2, 3] });
  markers.marker(o, Shape.Ring, 8, THEME.cursor);
  markers.marker(o, Shape.Dot, 4, THEME.cursor);
  drawAtPointer(lines, text, m, readoutOf(rangeBearing(dist, brg), from.label));
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
      input,
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
        input,
      );
    }
  }
  drawRangeCursor(lines, markers, text, input);
  return [lines.finish(), markers.finish(), text.finish()];
}
