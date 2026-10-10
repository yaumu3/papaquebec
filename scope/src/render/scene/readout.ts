import { padBearing } from '../../lib/format';
import {
  type GeoPoint,
  trueToMagnetic,
  type UnprojectFn,
  type Vec2,
  velocityNm,
} from '../../lib/geo';
import { inverse } from '../../lib/geodesic';
import type { Declination } from '../../lib/wmm';
import type { Track } from '../../state/track';
import type { Anchor, LineBatch, TextBatch } from './pack';
import { THEME, trackLabel } from './rules';

/** A point a readout measures from or to. */
export interface Point {
  /** Where it is drawn on the scope plane. */
  pos: Vec2;
  /** Where it is on the earth, which readouts measure between. */
  geo: GeoPoint;
  vel: Vec2 | null;
  label: string;
}

export function trackPoint(t: Track): Point | null {
  const p = t.position;
  if (p.kind !== 'live' && p.kind !== 'last') return null;
  const vel = t.gs !== undefined && t.track !== undefined ? velocityNm(t.gs, t.track) : null;
  return { pos: { x: p.x, y: p.y }, geo: { lat: p.lat, lon: p.lon }, vel, label: trackLabel(t) };
}

/** A still point placed on the scope plane rather than reported by a target. */
export function freePoint(pos: Vec2, label: string, unproject: UnprojectFn): Point {
  return { pos, geo: unproject(pos.x, pos.y), vel: null, label };
}

/**
 * How far `b` lies from `a` along the geodesic, in NM, and on what initial bearing, made
 * magnetic by the declination at `a`, where it is measured.
 */
export function measure(
  a: Point,
  b: Point,
  declination: Declination,
): { dist: number; brg: number } {
  const r = inverse(a.geo, b.geo);
  return {
    dist: r.distanceNm,
    brg: trueToMagnetic(r.bearingTrue, declination(a.geo.lat, a.geo.lon)),
  };
}

/** Distance in NM over magnetic bearing, the first two lines of every readout. */
export function rangeBearing(dist: number, brg: number): string[] {
  return [dist.toFixed(1), `${padBearing(brg)}°`];
}

/** A line of a readout; a dim one names what is measured. */
export interface ReadoutLine {
  text: string;
  dim?: boolean;
}

/** A dim line naming what a readout measures. */
export const nameLine = (name: string): ReadoutLine => ({ text: name, dim: true });

/** Figures as readout lines. */
export const figures = (lines: string[]): ReadoutLine[] => lines.map((text) => ({ text }));

/** A readout: its figures, then what it measures named dim beneath. */
export const readoutOf = (lines: string[], name: string): ReadoutLine[] => [
  ...figures(lines),
  nameLine(name),
];

/** Lines of a readout stack this far apart, CSS px. */
const READOUT_LINE_PX = 13;

const lineSize = (l: ReadoutLine) => (l.dim ? 10 : 11);

/** The stack of a readout's lines from `at` down, figures bright and names dim. */
export function drawStack(text: TextBatch, lines: ReadoutLine[], at: Anchor): void {
  lines.forEach((l, i) => {
    const py = (at.py ?? 0) + i * READOUT_LINE_PX;
    text.text(l.text, { ...at, py }, lineSize(l), l.dim ? THEME.cursorDim : THEME.cursor);
  });
}

/** Arm of the crosshair at the pointer, CSS px. */
const CROSSHAIR_PX = 8;

/** A readout at the pointer: a crosshair there, the stack below right of it. */
export function drawAtPointer(
  lines: LineBatch,
  text: TextBatch,
  at: Vec2,
  stack: ReadoutLine[],
): void {
  lines.segment({ ...at, px: -CROSSHAIR_PX }, { ...at, px: CROSSHAIR_PX }, THEME.cursor);
  lines.segment({ ...at, py: -CROSSHAIR_PX }, { ...at, py: CROSSHAIR_PX }, THEME.cursor);
  drawStack(text, stack, { ...at, px: 12, py: 6 });
}
