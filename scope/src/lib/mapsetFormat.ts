/**
 * The constants of the map set format, as `schema/mapset.schema.json` states them. The parser
 * mirrors that schema from these; the schema test holds the two together. No imports: the
 * conversion scripts load this file at runtime in a container with no `node_modules`.
 */

export const MAPSET_VERSION = 2;

/** The set generated around the site at container start; a preset that cannot be removed. */
export const BUILTIN_ID = 'openaip';

/**
 * Every layer by the geometry of its features. The format defines all but the last two, which the
 * scope makes itself from no map set. The display side of a layer is in `layers.ts`.
 */
const GEOMETRY = {
  ad: 'point',
  navaid: 'point',
  fix: 'point',
  vfr: 'point',
  conv: 'route',
  rnav: 'route',
  dct: 'route',
  sid: 'route',
  star: 'route',
  trans: 'route',
  hold: 'hold',
  ctr: 'area',
  tma: 'area',
  cta: 'area',
  advisory: 'area',
  sector: 'area',
  fir: 'area',
  asr: 'area',
  pr: 'area',
  dng: 'area',
  tra: 'area',
  adiz: 'area',
  civt: 'area',
  coast: 'scope',
  rings: 'scope',
} as const;

type Geometry = (typeof GEOMETRY)[ScopeLayer];

/** The map set layers plus the two the scope makes itself. */
export type ScopeLayer = keyof typeof GEOMETRY;
type LayerOf<G extends Geometry> = {
  [L in ScopeLayer]: (typeof GEOMETRY)[L] extends G ? L : never;
}[ScopeLayer];

export type PointLayer = LayerOf<'point'>;
export type AreaLayer = LayerOf<'area'>;
export type RouteLayer = LayerOf<'route'>;
export type Layer = LayerOf<'point' | 'route' | 'hold' | 'area'>;

const layersOf = <G extends Geometry>(...geometries: readonly G[]): readonly LayerOf<G>[] =>
  Object.entries(GEOMETRY)
    .filter((entry): entry is [LayerOf<G>, G] => geometries.some((g) => g === entry[1]))
    .map(([layer]) => layer);

export const POINT_LAYERS = layersOf('point');
export const ROUTE_LAYERS = layersOf('route');
export const AREA_LAYERS = layersOf('area');
export const LAYERS = layersOf('point', 'route', 'hold', 'area');

export const isScopeLayer = (name: string): name is ScopeLayer => name in GEOMETRY;
export const isPointLayer = (layer: ScopeLayer): layer is PointLayer => GEOMETRY[layer] === 'point';
export const isRouteLayer = (layer: ScopeLayer): layer is RouteLayer => GEOMETRY[layer] === 'route';
/** Whether a layer comes from a map set, not from the scope itself. */
export const isChartLayer = (layer: ScopeLayer): layer is Layer => GEOMETRY[layer] !== 'scope';

/** The point layers whose ids are unique within a set. */
export const POINT_ID_LAYERS: ReadonlySet<string> = new Set<Layer>(['ad', 'navaid', 'fix']);

/** The area layers that divide airspace among control units: an ACC sector, a FIR or UIR. */
export const SECTOR_LAYERS: ReadonlySet<Layer> = new Set<Layer>(['sector', 'fir']);

/** A published vertical limit: SFC, GND, UNL, a flight level, or feet with their reference. */
export const LIMIT_PATTERN = /^(SFC|GND|UNL|FL[0-9]{2,3}|[0-9]{1,5}FT( AGL)?)$/;
/** A frequency in MHz as published, e.g. `127.35`. */
export const FREQ_PATTERN = /^[0-9]{1,3}\.[0-9]{1,3}$/;
export const SET_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** An AIRAC effective date, `YYYY-MM-DD`. */
export const EFFECTIVE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

export const NAME_MAX = 64;
export const ID_MAX = 32;
export const KIND_MAX = 16;
export const TITLE_MAX = 80;
export const NOTE_MAX = 1000;
export const CALLSIGN_MAX = 32;
/** An ICAO location indicator. */
export const AD_LENGTH = 4;
