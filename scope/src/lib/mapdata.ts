/**
 * What the scope draws of the static geography: the coastline as shipped in
 * `public/map/coast.json`, and the lists a chart is drawn from. All positions are lat/lon
 * degrees unless a type says otherwise.
 */
import { isNum, isRecord } from './guards';

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

export interface Airport extends Waypoint {
  name: string;
}

export interface Route {
  name: string;
  points: LatLon[];
}

/** A polygon airspace with optional vertical limits in feet. */
export interface Airspace {
  name: string;
  kind: string;
  points: LatLon[];
  dashed: boolean;
  lowerFt?: number;
  upperFt?: number;
}

/** The lists the renderer draws, one per layer toggle of the Maps panel. */
export interface DrawnLayers {
  waypoints: Waypoint[];
  navaids: Navaid[];
  airways: Route[];
  airspace: Airspace[];
  sectors: Route[];
  airports: Airport[];
}

const isPair = (v: unknown): v is LonLat => Array.isArray(v) && v.length === 2 && v.every(isNum);
const isLine = (v: unknown): v is LonLat[] => Array.isArray(v) && v.every(isPair);

export function parseCoast(raw: unknown): CoastData {
  if (isRecord(raw) && Array.isArray(raw.lines)) {
    return { lines: raw.lines.filter(isLine) };
  }
  throw new Error('coast.json: unexpected shape');
}
