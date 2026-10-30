/**
 * Reading a map set: a GeoJSON FeatureCollection (RFC 7946) with the profile of
 * `schema/mapset.schema.json`, which the schemas here mirror from the shared constants of
 * `mapsetFormat.ts`. A Feature is dispatched on `properties.layer` first, so a fault is
 * reported at a path inside the Feature and never as a union that matched nothing.
 */
import * as z from 'zod/mini';

import { isRecord } from './guards';
import { describeIssues, type Issue } from './issues';
import {
  AD_LENGTH,
  AREA_LAYERS,
  CALLSIGN_MAX,
  EFFECTIVE_PATTERN,
  FREQ_PATTERN,
  ID_MAX,
  KIND_MAX,
  LAYERS,
  type Layer,
  LIMIT_PATTERN,
  MAPSET_VERSION,
  NAME_MAX,
  NOTE_MAX,
  POINT_LAYERS,
  ROUTE_LAYERS,
  SET_ID_PATTERN,
  TITLE_MAX,
} from './mapsetFormat';

z.config(z.locales.en());

const Bbox = z.optional(z.array(z.number()).check(z.minLength(4)));
const Position = z.tuple([
  z.number().check(z.gte(-180), z.lte(180)),
  z.number().check(z.gte(-90), z.lte(90)),
]);
const PointGeometry = z.object({
  type: z.literal('Point'),
  coordinates: Position,
  bbox: Bbox,
});
const LineGeometry = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(Position).check(z.minLength(2)),
  bbox: Bbox,
});
const PolygonGeometry = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(z.array(Position).check(z.minLength(4))).check(z.minLength(1)),
  bbox: Bbox,
});

const Name = z.string().check(z.minLength(1), z.maxLength(NAME_MAX));
const Kind = z.optional(z.string().check(z.minLength(1), z.maxLength(KIND_MAX)));
const Limit = z.optional(z.string().check(z.regex(LIMIT_PATTERN)));
const Inbound = z.optional(z.number().check(z.gte(0), z.lt(360)));
const isUnique = (items: readonly string[]) => new Set(items).size === items.length;

const PointProperties = z.strictObject({
  layer: z.enum(POINT_LAYERS),
  id: z.string().check(z.minLength(1), z.maxLength(ID_MAX)),
  kind: Kind,
  name: z.optional(z.string().check(z.maxLength(NAME_MAX))),
  ad: z.optional(z.string().check(z.length(AD_LENGTH))),
});
const RouteProperties = z.strictObject({
  layer: z.enum(ROUTE_LAYERS),
  name: Name,
  oneWay: z.optional(z.boolean()),
  kind: Kind,
});
const HoldProperties = z
  .strictObject({
    layer: z.literal('hold'),
    inboundMag: Inbound,
    inboundTrue: Inbound,
    turn: z.enum(['L', 'R']),
    kind: Kind,
  })
  .check(
    z.refine(
      (hold) => hold.inboundMag !== undefined || hold.inboundTrue !== undefined,
      'a hold needs inboundMag or inboundTrue',
    ),
  );
const AreaProperties = z.strictObject({
  layer: z.enum(AREA_LAYERS),
  name: Name,
  kind: Kind,
  lower: Limit,
  upper: Limit,
  callsign: z.optional(z.string().check(z.maxLength(CALLSIGN_MAX))),
  freqs: z.optional(
    z
      .array(z.string().check(z.regex(FREQ_PATTERN)))
      .check(z.minLength(1), z.refine(isUnique, 'frequencies must be unique')),
  ),
});

const feature = <P extends z.ZodMiniType, G extends z.ZodMiniType>(properties: P, geometry: G) =>
  z.object({
    type: z.literal('Feature'),
    id: z.optional(z.union([z.string(), z.number()])),
    bbox: Bbox,
    properties,
    geometry,
  });

const PointFeature = feature(PointProperties, PointGeometry);
const RouteFeature = feature(RouteProperties, LineGeometry);
const HoldFeature = feature(HoldProperties, PointGeometry);
const AreaFeature = feature(
  AreaProperties,
  z.discriminatedUnion('type', [PolygonGeometry, LineGeometry]),
);

export type MapSetFeature =
  | z.infer<typeof PointFeature>
  | z.infer<typeof RouteFeature>
  | z.infer<typeof HoldFeature>
  | z.infer<typeof AreaFeature>;

const isOneOf = (layers: readonly string[], layer: Layer) => layers.includes(layer);

function featureSchema(layer: Layer) {
  if (layer === 'hold') return HoldFeature;
  if (isOneOf(POINT_LAYERS, layer)) return PointFeature;
  if (isOneOf(ROUTE_LAYERS, layer)) return RouteFeature;
  return AreaFeature;
}

const Collection = z.object({
  type: z.literal('FeatureCollection'),
  bbox: Bbox,
  version: z.literal(MAPSET_VERSION),
  id: z.optional(z.string().check(z.regex(SET_ID_PATTERN))),
  title: z.string().check(z.minLength(1), z.maxLength(TITLE_MAX)),
  effective: z.optional(z.string().check(z.regex(EFFECTIVE_PATTERN))),
  note: z.optional(z.string().check(z.maxLength(NOTE_MAX))),
  features: z.array(z.unknown()),
});

export type MapSetData = Omit<z.infer<typeof Collection>, 'features'> & {
  features: MapSetFeature[];
};

type Parsed<T> = { ok: true; data: T } | { ok: false; issues: Issue[] };

const isLayer = (v: unknown): v is Layer => (LAYERS as readonly unknown[]).includes(v);

const failure = (path: PropertyKey[], message: string): Parsed<never> => ({
  ok: false,
  issues: [{ path, message }],
});

/** One Feature, by its layer; the issues' paths are relative to the Feature. */
function parseFeature(raw: unknown): Parsed<MapSetFeature> {
  const properties = isRecord(raw) ? raw.properties : undefined;
  if (!isRecord(properties)) return failure(['properties'], 'expected an object');
  const layer = properties.layer;
  if (!isLayer(layer))
    return failure(['properties', 'layer'], `unknown layer ${JSON.stringify(layer)}`);
  const parsed = featureSchema(layer).safeParse(raw);
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, issues: parsed.error.issues };
}

export type MapSetValidation = { ok: true; data: MapSetData } | { ok: false; message: string };

/** Strict: the whole document must satisfy the schema, and the answer says where it does not. */
export function validateMapSet(raw: unknown): MapSetValidation {
  const root = Collection.safeParse(raw);
  if (!root.success) return { ok: false, message: describeIssues(root.error.issues) };
  const parsed = root.data.features.map(parseFeature);
  const issues = parsed.flatMap((p, i) =>
    p.ok ? [] : p.issues.map((x) => ({ ...x, path: ['features', i, ...x.path] })),
  );
  if (issues.length) return { ok: false, message: describeIssues(issues) };
  const features = parsed.flatMap((p) => (p.ok ? [p.data] : []));
  return { ok: true, data: { ...root.data, features } };
}
