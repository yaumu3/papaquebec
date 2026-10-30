/**
 * The constants of the map set format, as `schema/mapset.schema.json` states them. The parser
 * mirrors that schema from these; the schema test holds the two together. No imports: the
 * conversion scripts load this file at runtime in a container with no `node_modules`.
 */

export const MAPSET_VERSION = 2;

export const POINT_LAYERS = ['ad', 'navaid', 'fix', 'vfr'] as const;
export const ROUTE_LAYERS = ['conv', 'rnav', 'dct', 'sid', 'star', 'trans'] as const;
export const AREA_LAYERS = [
  'ctr',
  'tma',
  'cta',
  'advisory',
  'sector',
  'fir',
  'asr',
  'pr',
  'dng',
  'tra',
  'adiz',
  'civt',
] as const;
export const LAYERS = [...POINT_LAYERS, ...ROUTE_LAYERS, 'hold', ...AREA_LAYERS] as const;

export type Layer = (typeof LAYERS)[number];

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
