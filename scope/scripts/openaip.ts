/**
 * openAIP records to the scope's `aero.json`. Pure: the fetch lives in
 * `build-aero.ts`. Type codes follow the openAIP core API documentation.
 */
import type {
  AeroLayers,
  Airport,
  Airspace,
  LatLon,
  Navaid,
  Route,
  Waypoint,
} from '../src/lib/mapdata';
import { isRecord, isNum } from './guards';

export interface OpenAipInput {
  navaids: unknown[];
  airports: unknown[];
  reportingPoints: unknown[];
  airspaces: unknown[];
}

const NAVAID_KIND: Record<number, string> = {
  0: 'DME',
  1: 'TACAN',
  2: 'NDB',
  3: 'VOR',
  4: 'VOR-DME',
  5: 'VORTAC',
  6: 'DVOR',
  7: 'DVOR-DME',
  8: 'DVORTAC',
};

/** Airspace types drawn on the airspace layer, with their short labels. */
const AIRSPACE_KIND: Record<number, string> = {
  1: 'R',
  2: 'D',
  3: 'P',
  4: 'CTR',
  5: 'TMZ',
  6: 'RMZ',
  7: 'TMA',
  8: 'TRA',
  9: 'TSA',
  13: 'ATZ',
  17: 'ALERT',
  18: 'WARNING',
  23: 'TIZ',
  24: 'TIA',
  25: 'MTA',
  26: 'CTA',
};
/** Special-use airspace is dashed. */
const DASHED_KINDS = new Set(['R', 'D', 'P', 'TRA', 'TSA', 'ALERT', 'WARNING']);
/**
 * openAIP files much of Japan's airspace as type 0 "Other"; the name carries
 * the class. Only these are worth drawing; heliports and the like are not.
 */
const OTHER_BY_NAME: [RegExp, string][] = [
  [/\bTCA\b/, 'TCA'],
  [/\bACA\b/, 'ACA'],
  [/\bPCA\b/, 'PCA'],
  [/\bINFO ZONE\b/, 'INFO'],
];
/** Obstacle limitation surfaces are filed as airspace but are not. */
const NOT_AIRSPACE = /\bSURFACE\b/;

function kindOf(type: number, name: string): string | undefined {
  if (NOT_AIRSPACE.test(name)) return undefined;
  if (type === 0) return OTHER_BY_NAME.find(([re]) => re.test(name))?.[1];
  return AIRSPACE_KIND[type];
}

/** Airspace types drawn on the sector layer. */
const SECTOR_KIND: Record<number, string> = { 10: 'FIR', 27: 'ACC' };
const CLOSED_AIRPORT = 8;

const RAD = Math.PI / 180;

/** Great-circle distance in NM, close enough to clip a chart. */
export function withinRadius(
  site: LatLon | { lat: number; lon: number },
  radiusNm: number,
  lat: number,
  lon: number,
): boolean {
  const [slat, slon] = Array.isArray(site) ? site : [site.lat, site.lon];
  const dLat = (lat - slat) * RAD;
  const dLon = (lon - slon) * RAD;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(slat * RAD) * Math.cos(lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(a)) * 3440.065 <= radiusNm;
}

/** Ray casting on lat/lon; adequate for chart polygons that do not cross the antimeridian. */
function containsPoint(pts: LatLon[], lat: number, lon: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ai, bi] = pts[i] ?? [0, 0];
    const [aj, bj] = pts[j] ?? [0, 0];
    const crosses = ai > lat !== aj > lat && lon < ((bj - bi) * (lat - ai)) / (aj - ai) + bi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointOf(v: unknown): LatLon | null {
  if (!isRecord(v) || !isRecord(v.geometry) || v.geometry.type !== 'Point') return null;
  const c = v.geometry.coordinates;
  return Array.isArray(c) && isNum(c[0]) && isNum(c[1]) ? [c[1], c[0]] : null;
}

function ringOf(v: unknown): LatLon[] | null {
  if (!isRecord(v) || !isRecord(v.geometry) || v.geometry.type !== 'Polygon') return null;
  const c = v.geometry.coordinates;
  const outer = Array.isArray(c) ? c[0] : null;
  if (!Array.isArray(outer)) return null;
  const pts: LatLon[] = [];
  for (const p of outer) {
    if (!Array.isArray(p) || !isNum(p[0]) || !isNum(p[1])) return null;
    pts.push([Number(p[1].toFixed(4)), Number(p[0].toFixed(4))]);
  }
  return pts.length >= 3 ? pts : null;
}

/** openAIP limit to feet: unit 0 m, 1 ft, 6 flight level. */
function limitFt(v: unknown): number | undefined {
  if (!isRecord(v) || !isNum(v.value)) return undefined;
  switch (v.unit) {
    case 0:
      return Math.round(v.value * 3.28084);
    case 1:
      return v.value;
    case 6:
      return v.value * 100;
    default:
      return undefined;
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function toAero(
  input: OpenAipInput,
  site: { lat: number; lon: number },
  radiusNm: number,
): AeroLayers {
  const near = (p: LatLon) => withinRadius(site, radiusNm, p[0], p[1]);
  const relevant = (pts: LatLon[]) => pts.some(near) || containsPoint(pts, site.lat, site.lon);

  const navaids: Navaid[] = [];
  for (const n of input.navaids) {
    const p = pointOf(n);
    const id = isRecord(n) ? str(n.identifier) : null;
    if (!p || !id || !near(p)) continue;
    const kind = isRecord(n) && isNum(n.type) ? NAVAID_KIND[n.type] : undefined;
    navaids.push(kind ? { id, kind, lat: p[0], lon: p[1] } : { id, lat: p[0], lon: p[1] });
  }

  const airports: Airport[] = [];
  for (const a of input.airports) {
    const p = pointOf(a);
    const id = isRecord(a) ? str(a.icaoCode) : null;
    if (!p || !id || !near(p) || (isRecord(a) && a.type === CLOSED_AIRPORT)) continue;
    airports.push({ id, name: (isRecord(a) && str(a.name)) || id, lat: p[0], lon: p[1] });
  }

  const waypoints: Waypoint[] = [];
  for (const r of input.reportingPoints) {
    const p = pointOf(r);
    const id = isRecord(r) ? str(r.name) : null;
    if (!p || !id || !near(p)) continue;
    waypoints.push({ id, lat: p[0], lon: p[1] });
  }

  const airspace: Airspace[] = [];
  const sectors: Route[] = [];
  for (const a of input.airspaces) {
    const pts = ringOf(a);
    const name = isRecord(a) ? str(a.name) : null;
    if (!pts || !name || !relevant(pts) || !isRecord(a) || !isNum(a.type)) continue;
    const sectorKind = SECTOR_KIND[a.type];
    if (sectorKind) {
      sectors.push({ name, points: pts });
      continue;
    }
    const kind = kindOf(a.type, name);
    if (!kind) continue;
    const entry: Airspace = { name, kind, points: pts, dashed: DASHED_KINDS.has(kind) };
    const lower = limitFt(a.lowerLimit);
    const upper = limitFt(a.upperLimit);
    if (lower !== undefined) entry.lowerFt = lower;
    if (upper !== undefined) entry.upperFt = upper;
    airspace.push(entry);
  }

  return { waypoints, navaids, airways: [], airspace, sectors, airports };
}
