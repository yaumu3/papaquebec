/**
 * Static geography the scope draws, as shipped in `public/map/*.json`. All positions are
 * lat/lon degrees. The aero schema is the one source of truth: the types are inferred from
 * it, imports are validated against it, and `aero.schema.json` is generated from it.
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

/** The title a lenient parse gives a file that names none. */
export const UNTITLED_AERO = 'aero.json';

/** The drawn lists alone; what several map sets merge into. */
export const AeroLayersSchema = z.object({
  waypoints: orDefault(z.array(LISTS.waypoints), []),
  navaids: orDefault(z.array(LISTS.navaids), []),
  airways: orDefault(z.array(LISTS.airways), []),
  airspace: orDefault(z.array(LISTS.airspace), []),
  sectors: orDefault(z.array(LISTS.sectors), []),
  airports: orDefault(z.array(LISTS.airports), []),
});

export const AeroSchema = z.extend(AeroLayersSchema, {
  title: z.string().check(z.minLength(1)).register(z.globalRegistry, {
    description: 'Names the map set on the Maps panel; say where and when it is from.',
  }),
  note: z.optional(z.string()).register(z.globalRegistry, {
    description: 'Attribution, license or provenance, free text.',
  }),
});

export type Waypoint = z.infer<typeof Fix>;
export type Navaid = z.infer<typeof NavaidSchema>;
export type Route = z.infer<typeof RouteSchema>;
export type AirspaceCircle = z.infer<typeof CircleSchema>;
export type AirspacePolygon = z.infer<typeof PolygonSchema>;
export type Airspace = z.infer<typeof AirspaceSchema>;
export type Airport = z.infer<typeof AirportSchema>;
export type AeroLayers = z.infer<typeof AeroLayersSchema>;
export type AeroData = z.infer<typeof AeroSchema>;

export const EMPTY_AERO: AeroData = {
  title: UNTITLED_AERO,
  waypoints: [],
  navaids: [],
  airways: [],
  airspace: [],
  sectors: [],
  airports: [],
};

/** The enabled map sets as one chart: every list concatenated in set order. */
export function mergeAero(sets: readonly AeroLayers[]): AeroLayers {
  return {
    waypoints: sets.flatMap((s) => s.waypoints),
    navaids: sets.flatMap((s) => s.navaids),
    airways: sets.flatMap((s) => s.airways),
    airspace: sets.flatMap((s) => s.airspace),
    sectors: sets.flatMap((s) => s.sectors),
    airports: sets.flatMap((s) => s.airports),
  };
}

const isPairList = (v: unknown): v is LonLat[] => PairList.safeParse(v).success;

/** The well-formed entries of a list, in order; anything else is dropped. */
function list<T>(v: unknown, schema: z.ZodMiniType<T>): T[] {
  if (!Array.isArray(v)) return [];
  const out: T[] = [];
  for (const item of v) {
    const r = schema.safeParse(item);
    if (r.success) out.push(r.data);
  }
  return out;
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
    title: typeof raw.title === 'string' && raw.title ? raw.title : UNTITLED_AERO,
    ...(typeof raw.note === 'string' ? { note: raw.note } : {}),
    waypoints: list(raw.waypoints, LISTS.waypoints),
    navaids: list(raw.navaids, LISTS.navaids),
    airways: list(raw.airways, LISTS.airways),
    airspace: list(raw.airspace, LISTS.airspace),
    sectors: list(raw.sectors, LISTS.sectors),
    airports: list(raw.airports, LISTS.airports),
  };
}

export type AeroValidation = { ok: true; data: AeroData } | { ok: false; message: string };

const SHOWN_ISSUES = 3;

const pathOf = (path: readonly PropertyKey[]): string =>
  path.reduce<string>(
    (acc, k) => (typeof k === 'number' ? `${acc}[${k}]` : acc ? `${acc}.${String(k)}` : String(k)),
    '',
  );

/** Strict: the whole file must match the schema, and the answer says where it does not. */
export function validateAero(raw: unknown): AeroValidation {
  const r = AeroSchema.safeParse(raw);
  if (r.success) return { ok: true, data: r.data };
  const issues = r.error.issues;
  const lines = issues
    .slice(0, SHOWN_ISSUES)
    .map((i) => (i.path.length ? `${pathOf(i.path)}: ${i.message}` : i.message));
  const more = issues.length - lines.length;
  return { ok: false, message: lines.join('; ') + (more > 0 ? `; and ${more} more` : '') };
}
