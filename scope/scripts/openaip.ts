/**
 * openAIP records to a map set. Pure: the fetch lives in `build-mapset.ts`. Type codes follow
 * the openAIP core API documentation; the limits follow its airspace schema, where `unit` is 0
 * metres, 1 feet or 6 flight level, `referenceDatum` is 0 ground, 1 mean sea level or 2 standard
 * pressure, and unlimited is flight level 999 (the Japan export has no other encoding).
 */
import type { MapSetData } from '../src/lib/mapset';
import {
  type AreaLayer,
  BUILTIN_ID,
  ID_MAX,
  LIMIT_PATTERN,
  MAPSET_VERSION,
  NAME_MAX,
  NOTE_MAX,
  SECTOR_LAYERS,
  TITLE_MAX,
} from '../src/lib/mapsetFormat';
import { isNum, isRecord } from './guards';

/** A position as lat then lon, the order the conversion works in. */
type LatLon = [number, number];

export interface OpenAipInput {
  navaids: unknown[];
  airports: unknown[];
  reportingPoints: unknown[];
  airspaces: unknown[];
}

/** What the map set records about where its records came from. */
export interface Coverage {
  site: { lat: number; lon: number };
  radiusNm: number;
  countries: string[];
  fetched: string;
}

/** openAIP navaid types, spelled as the format lists them; the DVOR variants fold into VOR. */
const NAVAID_KIND: Record<number, string> = {
  0: 'DME',
  1: 'TACAN',
  2: 'NDB',
  3: 'VOR',
  4: 'VOR/DME',
  5: 'VORTAC',
  6: 'VOR',
  7: 'VOR/DME',
  8: 'VORTAC',
};

/** An airspace type, filed under a layer with the kind that refines it, if any. */
type Filing = [AreaLayer, string?];

const AIRSPACE: Record<number, Filing> = {
  1: ['pr', 'R'],
  2: ['dng', 'D'],
  3: ['pr', 'P'],
  4: ['ctr', 'CTR'],
  5: ['advisory', 'TMZ'],
  6: ['advisory', 'RMZ'],
  7: ['tma', 'TMA'],
  8: ['tra', 'TRA'],
  9: ['tra', 'TSA'],
  10: ['fir'],
  13: ['ctr', 'ATZ'],
  17: ['dng', 'ALERT'],
  18: ['dng', 'WARNING'],
  23: ['ctr', 'TIZ'],
  24: ['ctr', 'TIA'],
  25: ['tra', 'MTA'],
  26: ['cta', 'CTA'],
  27: ['sector'],
};

/**
 * openAIP files much of Japan's airspace as type 0 "Other"; the name carries the class. Only
 * these are worth drawing; heliports and the like are not.
 */
const OTHER_BY_NAME: [RegExp, Filing][] = [
  [/\bTCA\b/, ['advisory', 'TCA']],
  [/\bACA\b/, ['tma', 'ACA']],
  [/\bPCA\b/, ['cta', 'PCA']],
  [/\bINFO ZONE\b/, ['ctr', 'INFO']],
];
/** Obstacle limitation surfaces are filed as airspace but are not. */
const NOT_AIRSPACE = /\bSURFACE\b/;
const CLOSED_AIRPORT = 8;
const UNLIMITED_FL = 999;
const FEET_PER_METRE = 3.28084;

/** FIR and ACC are filed whatever their name says; everything else loses to the surface rule. */
function filingOf(type: number, name: string): Filing | undefined {
  const filing = AIRSPACE[type];
  if (filing && SECTOR_LAYERS.has(filing[0])) return filing;
  if (NOT_AIRSPACE.test(name)) return undefined;
  return type === 0 ? OTHER_BY_NAME.find(([re]) => re.test(name))?.[1] : filing;
}

const RAD = Math.PI / 180;

/** Great-circle distance in NM, close enough to clip a chart. */
export function withinRadius(
  site: Coverage['site'],
  radiusNm: number,
  lat: number,
  lon: number,
): boolean {
  const dLat = (lat - site.lat) * RAD;
  const dLon = (lon - site.lon) * RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(site.lat * RAD) * Math.cos(lat * RAD) * Math.sin(dLon / 2) ** 2;
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

/** The exterior ring as lat/lon, vertices rounded to 4 decimals. */
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

/** An openAIP limit as a published string; one the format cannot hold is left out. */
function limitOf(v: unknown): string | undefined {
  if (!isRecord(v) || !isNum(v.value)) return undefined;
  const feet = v.unit === 0 ? Math.round(v.value * FEET_PER_METRE) : v.value;
  let limit: string | undefined;
  if (v.unit === 6) {
    limit = v.value === UNLIMITED_FL ? 'UNL' : `FL${String(v.value).padStart(2, '0')}`;
  } else if (v.unit === 0 || v.unit === 1) {
    if (v.referenceDatum !== 0) limit = `${feet}FT`;
    else limit = feet === 0 ? 'SFC' : `${feet}FT AGL`;
  }
  return limit !== undefined && LIMIT_PATTERN.test(limit) ? limit : undefined;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

type Feature = MapSetData['features'][number];

const pointFeature = (
  layer: 'ad' | 'navaid' | 'vfr',
  [lat, lon]: LatLon,
  rest: { id: string; kind?: string; name?: string },
): Feature => ({
  type: 'Feature',
  properties: { layer, ...rest },
  geometry: { type: 'Point', coordinates: [lon, lat] },
});

export function toMapSet(
  input: OpenAipInput,
  { site, radiusNm, countries, fetched }: Coverage,
  warn: (message: string) => void = console.warn,
): MapSetData {
  const near = (p: LatLon) => withinRadius(site, radiusNm, p[0], p[1]);
  const relevant = (pts: LatLon[]) => pts.some(near) || containsPoint(pts, site.lat, site.lon);
  const features: Feature[] = [];
  const pointIds = new Set<string>();
  const addPointFeature = (id: string, make: () => Feature) => {
    if (pointIds.has(id)) warn(`repeated point id ${id}: only the first is kept`);
    else {
      pointIds.add(id);
      features.push(make());
    }
  };

  for (const n of input.navaids) {
    const p = pointOf(n);
    const id = isRecord(n) ? str(n.identifier)?.slice(0, ID_MAX) : null;
    if (!p || !id || !near(p)) continue;
    const kind = isRecord(n) && isNum(n.type) ? NAVAID_KIND[n.type] : undefined;
    addPointFeature(id, () => pointFeature('navaid', p, { id, ...(kind ? { kind } : {}) }));
  }
  for (const a of input.airports) {
    const p = pointOf(a);
    const id = isRecord(a) ? str(a.icaoCode)?.slice(0, ID_MAX) : null;
    if (!p || !id || !near(p) || (isRecord(a) && a.type === CLOSED_AIRPORT)) continue;
    const name = isRecord(a) ? str(a.name)?.slice(0, NAME_MAX) : null;
    addPointFeature(id, () => pointFeature('ad', p, { id, ...(name ? { name } : {}) }));
  }
  for (const r of input.reportingPoints) {
    const p = pointOf(r);
    const id = isRecord(r) ? str(r.name)?.slice(0, ID_MAX) : null;
    if (p && id && near(p)) features.push(pointFeature('vfr', p, { id }));
  }
  for (const a of input.airspaces) {
    const ring = ringOf(a);
    const name = isRecord(a) ? str(a.name)?.slice(0, NAME_MAX) : null;
    if (!ring || !name || !relevant(ring) || !isRecord(a) || !isNum(a.type)) continue;
    const filing = filingOf(a.type, name);
    if (!filing) continue;
    const [layer, kind] = filing;
    const lower = limitOf(a.lowerLimit);
    const upper = limitOf(a.upperLimit);
    features.push({
      type: 'Feature',
      properties: {
        layer,
        name,
        ...(kind ? { kind } : {}),
        ...(lower ? { lower } : {}),
        ...(upper ? { upper } : {}),
      },
      geometry: { type: 'Polygon', coordinates: [ring.map(([lat, lon]) => [lon, lat])] },
    });
  }

  return {
    type: 'FeatureCollection',
    version: MAPSET_VERSION,
    id: BUILTIN_ID,
    title: `openAIP ${countries.join(' ')} ${fetched}`.slice(0, TITLE_MAX),
    note: `openAIP (https://www.openaip.net, CC BY-NC-SA 4.0) within ${radiusNm} NM of ${site.lat}, ${site.lon}; countries ${countries.join(', ')}; fetched ${fetched}.`.slice(
      0,
      NOTE_MAX,
    ),
    features,
  };
}
