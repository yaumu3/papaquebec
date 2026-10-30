/**
 * What the scope draws of the static geography: the coastline as shipped in
 * `public/map/coast.json`, and the lists a chart is drawn from. All positions are lat/lon
 * degrees unless a type says otherwise.
 */
import * as z from 'zod/mini';
import { _default as orDefault } from 'zod/mini';

import { isRecord } from './guards';

z.config(z.locales.en());

export type LonLat = [number, number];
export type LatLon = [number, number];

export interface CoastData {
  lines: LonLat[][];
}

const Pair = z.tuple([z.number(), z.number()]);
const PairList = z.array(Pair);
const Fix = z.object({ id: z.string(), lat: z.number(), lon: z.number() });
const NavaidSchema = z.extend(Fix, { kind: z.optional(z.string()) });
const RouteSchema = z.object({ name: z.string(), points: PairList });
const CircleSchema = z.object({
  name: z.string(),
  center: Pair,
  radiusNm: z.number(),
  dashed: z.optional(z.boolean()),
});
/** A polygon airspace with optional vertical limits in feet. */
const PolygonSchema = z.object({
  name: z.string(),
  kind: z.optional(z.string()),
  points: PairList.check(z.minLength(3)),
  dashed: z.optional(z.boolean()),
  lowerFt: z.optional(z.number()),
  upperFt: z.optional(z.number()),
});
const AirspaceSchema = z.union([CircleSchema, PolygonSchema]);
const AirportSchema = z.extend(Fix, { name: z.string() });

const LISTS = {
  waypoints: Fix,
  navaids: NavaidSchema,
  airways: RouteSchema,
  airspace: AirspaceSchema,
  sectors: RouteSchema,
  airports: AirportSchema,
};

/** The drawn lists alone; what several map sets merge into. */
export const AeroLayersSchema = z.object({
  waypoints: orDefault(z.array(LISTS.waypoints), []),
  navaids: orDefault(z.array(LISTS.navaids), []),
  airways: orDefault(z.array(LISTS.airways), []),
  airspace: orDefault(z.array(LISTS.airspace), []),
  sectors: orDefault(z.array(LISTS.sectors), []),
  airports: orDefault(z.array(LISTS.airports), []),
});

export type Waypoint = z.infer<typeof Fix>;
export type Navaid = z.infer<typeof NavaidSchema>;
export type Route = z.infer<typeof RouteSchema>;
export type Airspace = z.infer<typeof AirspaceSchema>;
export type Airport = z.infer<typeof AirportSchema>;
export type DrawnLayers = z.infer<typeof AeroLayersSchema>;

const isPairList = (v: unknown): v is LonLat[] => PairList.safeParse(v).success;

export function parseCoast(raw: unknown): CoastData {
  if (isRecord(raw) && Array.isArray(raw.lines)) {
    return { lines: raw.lines.filter(isPairList) };
  }
  throw new Error('coast.json: unexpected shape');
}
