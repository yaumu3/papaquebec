import type { ResolutionAdvisory } from '../../../lib/acas';
import { type GeoPoint, turn } from '../../../lib/geo';
import { inverse } from '../../../lib/geodesic';
import { RAD } from '../../../lib/units';
import { magneticBearing } from '../../../state/magnetic';
import type { Position, Track } from '../../../state/track';
import { holdsAll } from '../freshness';
import type { Point } from '../glide';
import type { Moment } from '../moment';
import { type NdGeometry, ndPoint, onArc, pxOf } from './geometry';
import { type NdFrame } from './readout';

/** The vertical speed in fpm from which TCAS shows a vertical arrow beside traffic (RTCA DO-185B). */
const ARROW_FPM = 500;

/** A relative altitude in whole hundreds of feet, halves rounded away from zero. */
const hundredsOf = (deltaFt: number): number =>
  Math.sign(deltaFt) * Math.round(Math.abs(deltaFt) / 100);

/**
 * The altitude of traffic relative to own ship in hundreds of feet, signed by the rounded value
 * so that level reads `+00`, at least two digits and never clipped. Halves round away from zero.
 */
export function relativeAltitudeLabel(deltaFt: number): string {
  const hundreds = hundredsOf(deltaFt);
  return `${hundreds < 0 ? '-' : '+'}${String(Math.abs(hundreds)).padStart(2, '0')}`;
}

/** The arrow for traffic climbing or descending at 500 fpm or more by its own held rate. */
export function verticalArrow(t: Track, now: number): '↑' | '↓' | undefined {
  const rate = t.verticalRate;
  if (rate === undefined || Math.abs(rate) < ARROW_FPM || !holdsAll(t, ['verticalRate'], now)) {
    return undefined;
  }
  return rate > 0 ? '↑' : '↓';
}

/** Traffic within this range (NM) and relative altitude (ft) is proximate (RTCA DO-185B). */
const PROXIMATE_NM = 6;
const PROXIMATE_FT = 1200;

/** Whether traffic is proximate or other, the edges included. */
export function trafficKind(distanceNm: number, deltaFt: number): 'other' | 'proximate' {
  return distanceNm <= PROXIMATE_NM && Math.abs(deltaFt) <= PROXIMATE_FT ? 'proximate' : 'other';
}

/** TCAS II's normal display band either side of own ship, in feet of pressure altitude (RTCA DO-185B). */
const TCAS_BAND_FT = 2700;
/** Traffic is drawn no nearer the arc than this, in pixels. */
const EDGE_PX = 4;
/** The slack of the plane's distances over the geodesic's, far over their real difference near the site. */
const PLANE_MARGIN = 1.1;

/** What the ND is showing: its mode and orientation, its range and its geometry. */
export interface NdView {
  frame: Pick<NdFrame, 'mode' | 'orient'>;
  rangeNm: number;
  g: NdGeometry;
}

/** Where traffic lies from own ship: east and north in NM, magnetic north up. */
const offsetOf = (bearingMag: number, distanceNm: number): Point => [
  distanceNm * Math.sin(bearingMag * RAD),
  distanceNm * Math.cos(bearingMag * RAD),
];

/** Traffic placed on the display: its centre in pixels, where it lies, and how far and how high it is from own ship. */
export interface Placed {
  track: Track;
  x: number;
  y: number;
  at: Point;
  distanceNm: number;
  deltaFt: number;
}

type LivePosition = Extract<Position, { kind: 'live' }>;

/** Own ship as the traffic is measured from: where it is held, how high, and where its readings place it. */
interface Origin {
  position: LivePosition;
  alt: number;
  at: GeoPoint | undefined;
}

const heldPosition = (t: Track, now: number): LivePosition | undefined =>
  t.position.kind === 'live' && holdsAll(t, ['position'], now) ? t.position : undefined;

const heldAltitude = (t: Track, now: number): number | undefined =>
  typeof t.alt === 'number' && holdsAll(t, ['alt'], now) ? t.alt : undefined;

/** Whether two points of the plane lie within `limitNm` of each other, with the margin: the cheap test before a geodesic. */
export function nearOnPlane(
  a: { x: number; y: number },
  b: { x: number; y: number },
  limitNm: number,
): boolean {
  return Math.hypot(b.x - a.x, b.y - a.y) <= limitNm * PLANE_MARGIN;
}

/** The pixel at `rel` degrees off the top and `distanceNm` out, or nothing outside the arc or beyond the range. */
function pointOnDisplay(
  view: Pick<NdView, 'g' | 'rangeNm'>,
  rel: number,
  distanceNm: number,
): [number, number] | undefined {
  const { g, rangeNm } = view;
  const radius = pxOf(g, distanceNm, rangeNm);
  return onArc(rel) && radius <= g.r - EDGE_PX ? ndPoint(g, rel, radius) : undefined;
}

/**
 * Where `at` lies from own ship `from`: its distance, its magnetic bearing, and that off the top
 * of the display; at the same point, straight ahead.
 */
function polarOf(
  from: LivePosition,
  fromAt: GeoPoint | undefined,
  at: LivePosition,
  view: NdView,
): { rel: number; bearing: number; distanceNm: number } {
  const { distanceNm, bearingTrue } = inverse(from, at);
  const coincident = distanceNm === 0 || Number.isNaN(bearingTrue);
  const bearing = coincident ? view.frame.orient : magneticBearing(bearingTrue, fromAt);
  return { rel: turn(view.frame.orient, bearing), bearing, distanceNm };
}

/** The track's place on the display, or nothing when it lies outside the arc or beyond the range. */
function placeOnDisplay(
  own: Origin,
  t: Track,
  alt: number,
  at: LivePosition,
  view: NdView,
): Placed | undefined {
  const { rel, bearing, distanceNm } = polarOf(own.position, own.at, at, view);
  const point = pointOnDisplay(view, rel, distanceNm);
  if (!point) return undefined;
  const [x, y] = point;
  return { track: t, x, y, at: offsetOf(bearing, distanceNm), distanceNm, deltaFt: alt - own.alt };
}

/** Own ship as the traffic is measured from, when it holds a position and an altitude. */
function originOf(own: Track, now: number): Origin | undefined {
  const position = heldPosition(own, now);
  const alt = heldAltitude(own, now);
  return position && alt !== undefined ? { position, alt, at: own.at } : undefined;
}

/**
 * The traffic around own ship that the display draws: other tracks with a held position and
 * altitude within the band, inside the arc and the range. Nothing while own ship lacks a held
 * position or a held altitude.
 */
export function trafficAround(
  own: Track,
  others: Iterable<Track>,
  now: number,
  view: NdView,
): Placed[] {
  const origin = originOf(own, now);
  if (!origin) return [];
  const { position, alt } = origin;
  const limitNm = (view.rangeNm * (view.g.r - EDGE_PX)) / view.g.r;
  const placed: Placed[] = [];
  for (const t of others) {
    const at = heldPosition(t, now);
    const tAlt = heldAltitude(t, now);
    if (t.hex === own.hex || !at || tAlt === undefined) continue;
    if (Math.abs(tAlt - alt) > TCAS_BAND_FT || !nearOnPlane(position, at, limitNm)) continue;
    const one = placeOnDisplay(origin, t, tAlt, at, view);
    if (one) placed.push(one);
  }
  return placed;
}

/** How far the label stands above or below the symbol's centre, and the arrow right of it, in pixels. */
const LABEL_OFFSET_PX = 12;
const ARROW_GAP_PX = 9;

export type TrafficKind = 'other' | 'proximate' | 'threat';

/** The key of the threat the aircraft places by range and bearing, which no track address is. */
const ESTIMATE_KEY = 'estimate';

/**
 * A symbol to draw: its kind and centre, the label centred on its own point and the arrow from
 * its left edge; keyed by the track's address, so that it is the same symbol from one report to
 * the next.
 */
export interface TrafficSymbol {
  kind: TrafficKind;
  key: string;
  /** Where the traffic lies from own ship: east and north in NM, magnetic north up. */
  at: Point;
  x: number;
  y: number;
  label?: { text: string; x: number; y: number } | undefined;
  arrow?: { glyph: '↑' | '↓'; x: number; y: number } | undefined;
}

/** The symbols a pointer can hover: all but the threat placed by range and bearing, which no track backs. */
export const peekable = (symbols: readonly TrafficSymbol[]): TrafficSymbol[] =>
  symbols.filter((symbol) => symbol.key !== ESTIMATE_KEY);

/** The hoverable symbol of aircraft `hex`, if it is drawn. */
export const peekedSymbol = (
  symbols: readonly TrafficSymbol[],
  hex: string | null,
): TrafficSymbol | undefined => peekable(symbols).find((symbol) => symbol.key === hex);

/** The symbol drawn at (x, y) instead: its label and arrow move with it. */
export function symbolAt(symbol: TrafficSymbol, x: number, y: number): TrafficSymbol {
  const dx = x - symbol.x;
  const dy = y - symbol.y;
  const moved = { ...symbol, x, y };
  if (symbol.label)
    moved.label = { ...symbol.label, x: symbol.label.x + dx, y: symbol.label.y + dy };
  if (symbol.arrow)
    moved.arrow = { ...symbol.arrow, x: symbol.arrow.x + dx, y: symbol.arrow.y + dy };
  return moved;
}

/**
 * The symbol as drawn with the compass turned to `orient` and its traffic `at` (east, north) NM
 * of own ship; none where the display does not reach.
 */
export function symbolDrawn(
  symbol: TrafficSymbol,
  at: Point,
  orient: number,
  view: Pick<NdView, 'g' | 'rangeNm'>,
): TrafficSymbol | undefined {
  const [east, north] = at;
  const distanceNm = Math.hypot(east, north);
  const rel = distanceNm === 0 ? 0 : turn(orient, Math.atan2(east, north) / RAD);
  const point = pointOnDisplay(view, rel, distanceNm);
  return point && symbolAt(symbol, point[0], point[1]);
}

/** What the ND draws of the traffic: the symbols in paint order, and the annunciations. */
export interface NdTraffic {
  symbols: TrafficSymbol[];
  traffic: boolean;
  offscale: boolean;
}

/** The advisory is in force while it is present and not terminated. */
const advisoryActive = (ra: ResolutionAdvisory | undefined): ra is ResolutionAdvisory =>
  ra !== undefined && !ra.terminated;

/** The address the active advisory names its threat by, if it does. */
function threatAddress(ra: ResolutionAdvisory | undefined): string | undefined {
  return advisoryActive(ra) && ra.threat && 'address' in ra.threat ? ra.threat.address : undefined;
}

/** The threat named by its address, placed wherever it is held, whatever its altitude; no band applies. */
function placeThreat(own: Track, threat: Track | undefined, now: number, view: NdView) {
  const origin = originOf(own, now);
  const at = threat && heldPosition(threat, now);
  const alt = threat && heldAltitude(threat, now);
  if (!origin || !threat || !at || alt === undefined) return undefined;
  return placeOnDisplay(origin, threat, alt, at, view);
}

const NONE: NdTraffic = { symbols: [], traffic: false, offscale: false };

/** The label of a relative altitude for a symbol centred at (x, y): above it, or below it for traffic below. */
function labelOf(x: number, y: number, deltaFt: number): TrafficSymbol['label'] {
  const below = hundredsOf(deltaFt) < 0;
  return {
    text: relativeAltitudeLabel(deltaFt),
    x,
    y: y + (below ? LABEL_OFFSET_PX : -LABEL_OFFSET_PX),
  };
}

/** The symbol of placed traffic of a kind, with the label of its altitude and the arrow of its rate. */
function symbolOf(kind: TrafficKind, p: Placed, now: number): TrafficSymbol {
  const arrow = verticalArrow(p.track, now);
  return {
    kind,
    key: p.track.hex,
    at: p.at,
    x: p.x,
    y: p.y,
    label: labelOf(p.x, p.y, p.deltaFt),
    arrow: arrow && { glyph: arrow, x: p.x + ARROW_GAP_PX, y: p.y },
  };
}

/** A threat given by range and bearing: where the display puts it, and its altitude if the aircraft gave one. */
interface Estimate {
  rel: number;
  at: Point;
  rangeNm: number;
  altitude: number | undefined;
}

/**
 * Whether the threat named by its address lies where the display does not reach. Only a held
 * position of its own and of own ship says so; its altitude does not matter.
 */
function addressOffscale(
  own: Track,
  threat: Track | undefined,
  now: number,
  view: NdView,
): boolean {
  const from = heldPosition(own, now);
  const at = threat && heldPosition(threat, now);
  if (!from || !at) return false;
  const { rel, distanceNm } = polarOf(from, own.at, at, view);
  return !pointOnDisplay(view, rel, distanceNm);
}

/**
 * The threat given by range and bearing from own ship's heading, as the aircraft estimates it.
 * It needs a held heading to turn the bearing to the display, not own ship's position.
 */
function estimateOf(own: Track, now: number, view: NdView): Estimate | undefined {
  const threat = advisoryActive(own.ra) ? own.ra.threat : undefined;
  if (!threat || !('range' in threat) || !('bearing' in threat)) return undefined;
  const { range, bearing, altitude } = threat;
  if (range === undefined || bearing === undefined) return undefined;
  if (own.heading === undefined || !holdsAll(own, ['heading'], now)) return undefined;
  const bearingMag = own.heading + bearing;
  const rel = turn(view.frame.orient, bearingMag);
  return { rel, at: offsetOf(bearingMag, range), rangeNm: range, altitude };
}

/** Whether the threat given by range and bearing, with a held heading, lies where the display does not reach. */
function estimateOffscale(own: Track, now: number, view: NdView): boolean {
  const estimate = estimateOf(own, now, view);
  return !!estimate && !pointOnDisplay(view, estimate.rel, estimate.rangeNm);
}

/** The symbol of the threat given by position, labelled when both its altitude and own ship's are known. */
function threatByPosition(own: Track, now: number, view: NdView): TrafficSymbol | undefined {
  const estimate = estimateOf(own, now, view);
  const point = estimate && pointOnDisplay(view, estimate.rel, estimate.rangeNm);
  if (!estimate || !point) return undefined;
  const [x, y] = point;
  const ownAlt = heldAltitude(own, now);
  const { altitude } = estimate;
  const label =
    altitude !== undefined && ownAlt !== undefined ? labelOf(x, y, altitude - ownAlt) : undefined;
  return { kind: 'threat', key: ESTIMATE_KEY, at: estimate.at, x, y, label };
}

/** The traffic the display draws around own ship, none on a lost or blank display. */
export function ndTraffic(
  { r: own, instant: now }: Moment,
  others: Iterable<Track>,
  view: NdView,
): NdTraffic {
  if (view.frame.mode === 'lost' || view.frame.mode === 'blank') return NONE;
  const address = threatAddress(own.ra);
  const all = [...others];
  const placed = trafficAround(
    own,
    all.filter((t) => t.hex !== address),
    now,
    view,
  ).map((p) => ({ kind: trafficKind(p.distanceNm, p.deltaFt), p }));
  const symbols = (['other', 'proximate'] as const).flatMap((kind) =>
    placed.filter((t) => t.kind === kind).map((t) => symbolOf(kind, t.p, now)),
  );
  const threatTrack = all.find((t) => t.hex === address);
  const threat = placeThreat(own, threatTrack, now, view);
  if (threat) symbols.push(symbolOf('threat', threat, now));
  const byPosition = threatByPosition(own, now, view);
  if (byPosition) symbols.push(byPosition);
  const offscale = addressOffscale(own, threatTrack, now, view) || estimateOffscale(own, now, view);
  return { symbols, traffic: advisoryActive(own.ra), offscale };
}
