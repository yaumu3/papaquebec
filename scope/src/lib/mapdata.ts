/** Static geography the scope draws, as shipped in `public/map/*.json`. All positions are lat/lon degrees. */
import { isRecord, isNum } from './guards';

export type LonLat = [number, number];
export type LatLon = [number, number];

export interface CoastData {
  lines: LonLat[][];
}

export interface Waypoint {
  id: string;
  lat: number;
  lon: number;
}
export interface Navaid extends Waypoint {
  kind?: string;
}
export interface Route {
  name: string;
  points: LatLon[];
}
export interface AirspaceCircle {
  name: string;
  center: LatLon;
  radiusNm: number;
  dashed?: boolean;
}

/** A polygon airspace with optional vertical limits in feet. */
export interface AirspacePolygon {
  name: string;
  kind?: string;
  points: LatLon[];
  dashed?: boolean;
  lowerFt?: number;
  upperFt?: number;
}

export type Airspace = AirspaceCircle | AirspacePolygon;

export interface Airport extends Waypoint {
  name: string;
}

export interface AeroData {
  waypoints: Waypoint[];
  navaids: Navaid[];
  airways: Route[];
  airspace: Airspace[];
  sectors: Route[];
  airports: Airport[];
  /** ISO date the data was fetched from its source, when known. */
  fetched?: string;
}

export const EMPTY_AERO: AeroData = {
  waypoints: [],
  navaids: [],
  airways: [],
  airspace: [],
  sectors: [],
  airports: [],
};

const isPair = (v: unknown): v is [number, number] =>
  Array.isArray(v) && isNum(v[0]) && isNum(v[1]);
const isPairList = (v: unknown): v is [number, number][] => Array.isArray(v) && v.every(isPair);
const isFix = (v: unknown): v is Waypoint =>
  isRecord(v) && typeof v.id === 'string' && isNum(v.lat) && isNum(v.lon);
const isRoute = (v: unknown): v is Route =>
  isRecord(v) && typeof v.name === 'string' && isPairList(v.points);
const isCircle = (v: unknown): v is AirspaceCircle =>
  isRecord(v) && typeof v.name === 'string' && isPair(v.center) && isNum(v.radiusNm);
const isPolygon = (v: unknown): v is AirspacePolygon =>
  isRecord(v) && typeof v.name === 'string' && isPairList(v.points) && v.points.length >= 3;
const isAirspace = (v: unknown): v is Airspace => isCircle(v) || isPolygon(v);
const isAirport = (v: unknown): v is Airport =>
  isFix(v) && 'name' in v && typeof v.name === 'string';

function list<T>(v: unknown, guard: (x: unknown) => x is T): T[] {
  return Array.isArray(v) ? v.filter(guard) : [];
}

export function parseCoast(raw: unknown): CoastData {
  if (isRecord(raw) && Array.isArray(raw.lines)) {
    return { lines: raw.lines.filter(isPairList) };
  }
  throw new Error('coast.json: unexpected shape');
}

/** Lenient: a malformed entry is dropped, not fatal, so a partial chart still draws. */
export function parseAero(raw: unknown): AeroData {
  if (!isRecord(raw)) throw new Error('aero.json: unexpected shape');
  return {
    ...(typeof raw.fetched === 'string' ? { fetched: raw.fetched } : {}),
    waypoints: list(raw.waypoints, isFix),
    navaids: list(raw.navaids, isFix),
    airways: list(raw.airways, isRoute),
    airspace: list(raw.airspace, isAirspace),
    sectors: list(raw.sectors, isRoute),
    airports: list(raw.airports, isAirport),
  };
}
