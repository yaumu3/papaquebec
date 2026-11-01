import { type ItemPart, outlinesOf } from '../../lib/chart';
import type { Figure } from '../../lib/figure';
import { bearingOnScreen, northAt, type ProjectFn, type Vec2 } from '../../lib/geo';
import { geodesicLine } from '../../lib/geodesic';
import {
  DEFAULT_LINE_WIDTH,
  isPointStyle,
  LAYER_TABLE,
  type PointLayerStyle,
} from '../../lib/layers';
import type { Layer } from '../../lib/mapsetFormat';
import { navaidSymbol } from '../../lib/navaidSymbol';
import { inboundTrack, type Racetrack, racetrack } from '../../lib/racetrack';
import type { Declination } from '../../lib/wmm';
import { Shape } from '../protocol';
import type { LineBatch, MarkerBatch } from './pack';

/** The batches a figure draws into. */
export interface FigureOut {
  lines: LineBatch;
  markers: MarkerBatch;
}

/**
 * A figure at a point of the plane, at its own size on the screen: each stroke as segments
 * between anchors that share the point and differ in their px offsets, each disc as a marker.
 */
function putFigure(
  { lines, markers }: FigureOut,
  at: Vec2,
  { strokes, discs }: Figure,
  color: string,
): void {
  for (const { points, closed, width, dash } of strokes) {
    const anchors = (closed ? [...points, points[0]] : points).flatMap((p) =>
      p ? [{ ...at, px: p.x, py: p.y }] : [],
    );
    lines.polyline(anchors, color, { width, ...(dash && { dash }) });
  }
  for (const { at: offset, radius } of discs) {
    markers.marker({ ...at, px: offset.x, py: offset.y }, Shape.Disc, 2 * radius, color);
  }
}

const MARKER_SHAPES = { ring: Shape.Ring, triangle: Shape.Triangle } as const;

/** A point's mark: its layer's marker, or the navaid symbol of `kind`. */
export function putPointMark(
  out: FigureOut,
  at: Vec2,
  { marker, size }: Pick<PointLayerStyle, 'marker' | 'size'>,
  kind: string | undefined,
  color: string,
): void {
  if (marker === 'navaid') putFigure(out, at, navaidSymbol(kind, size), color);
  else out.markers.marker(at, MARKER_SHAPES[marker], size, color);
}

/** A hold's racetrack and where its fix stands on the plane. */
interface PlacedRacetrack {
  at: Vec2;
  racetrack: Racetrack;
}

/**
 * The racetrack of a hold part, oriented by true north at its fix on the plane. The declination
 * is read only for a hold without `inboundTrue`. Nothing for a part that is not a hold.
 */
function racetrackAt(
  { geometry, properties }: ItemPart,
  project: ProjectFn,
  declinationAt: () => Declination,
): PlacedRacetrack | undefined {
  if (!('turn' in properties) || geometry.type !== 'Point') return undefined;
  const [lon, lat] = geometry.coordinates;
  const track = inboundTrack(properties, () => declinationAt()(lat, lon));
  const inbound = bearingOnScreen(northAt(project, lat, lon), track);
  return { at: project(lat, lon), racetrack: racetrack(inbound, properties.turn) };
}

/** Where a part draws: its lines and racetracks, and the strokes and markers of its symbol. */
export interface PartOut {
  lines: LineBatch;
  symbols: FigureOut;
}

/** What a part's drawing reads. */
export interface PartDrawing {
  project: ProjectFn;
  declinationAt: () => Declination;
  /** How wide to trace the part. A traced hold is its outline, without the chevrons. */
  traceWidth?: number;
}

/**
 * A part's whole geometry: a hold as its racetrack, a point as its layer's symbol in the part's
 * kind, a line or an area as every outline, not cut back at stops.
 */
export function putPart(
  layer: Layer,
  part: ItemPart,
  color: string,
  { project, declinationAt, traceWidth }: PartDrawing,
  out: PartOut,
): void {
  const { geometry, properties } = part;
  const placed = racetrackAt(part, project, declinationAt);
  if (placed) {
    const { outline, chevrons } = placed.racetrack;
    const strokes =
      traceWidth === undefined ? [outline, ...chevrons] : [{ ...outline, width: traceWidth }];
    const racetrackOut = { lines: out.lines, markers: out.symbols.markers };
    putFigure(racetrackOut, placed.at, { strokes, discs: [] }, color);
  } else if (geometry.type === 'Point') {
    const [lon, lat] = geometry.coordinates;
    const { style } = LAYER_TABLE[layer];
    if (isPointStyle(style)) {
      putPointMark(out.symbols, project(lat, lon), style, properties.kind, color);
    }
  } else {
    for (const outline of outlinesOf(geometry)) {
      const width = traceWidth ?? DEFAULT_LINE_WIDTH;
      out.lines.polyline(geodesicLine(outline, project), color, { width });
    }
  }
}
