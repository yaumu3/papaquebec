import type { Layer } from './mapsetFormat';

/**
 * Every layer the scope draws, front first: what is listed first is drawn over everything after
 * it. Points go over procedures over routes. Among areas, the boundaries an operator works to
 * go over those that only give context. The base map is behind all of it.
 */
export const DRAW_STACK = [
  'ad',
  'navaid',
  'fix',
  'vfr',
  'sid',
  'star',
  'trans',
  'conv',
  'rnav',
  'dct',
  'hold',
  'ctr',
  'pr',
  'tma',
  'sector',
  'fir',
  'dng',
  'tra',
  'adiz',
  'cta',
  'advisory',
  'civt',
  'asr',
  'coast',
  'rings',
] as const satisfies readonly (Layer | 'coast' | 'rings')[];

/** The map set layers plus the two the scope makes itself. */
export type ScopeLayer = (typeof DRAW_STACK)[number];

/** A map set layer with a style: every one but `hold`, which draws nothing yet. */
export type StyledLayer = Exclude<Layer, 'hold'>;

/** Whether a layer has a style: not `hold`, and not the two the scope makes itself. */
export const isStyled = (layer: ScopeLayer) =>
  layer !== 'hold' && layer !== 'coast' && layer !== 'rings';

/** The groups of the Maps panel, in the order they are listed there, which is not the draw order. */
export const LAYER_GROUPS: readonly { title: string; layers: readonly ScopeLayer[] }[] = [
  { title: 'POINTS', layers: ['ad', 'navaid', 'fix', 'vfr'] },
  { title: 'ROUTES', layers: ['conv', 'rnav', 'dct', 'hold'] },
  { title: 'PROCEDURES', layers: ['sid', 'star', 'trans'] },
  { title: 'RESTRICTIONS', layers: ['pr', 'dng', 'tra', 'adiz', 'civt'] },
  { title: 'AIRSPACE', layers: ['ctr', 'tma', 'cta', 'advisory', 'sector', 'fir', 'asr'] },
  { title: 'BASE MAP', layers: ['coast', 'rings'] },
];

/** What the Maps panel calls each layer. */
export const LAYER_NAMES: Record<ScopeLayer, string> = {
  ad: 'AERODROMES',
  navaid: 'NAVAIDS',
  fix: 'FIXES',
  vfr: 'VFR POINTS',
  conv: 'CONVENTIONAL',
  rnav: 'RNAV',
  dct: 'DCT',
  hold: 'EN-ROUTE HOLDING',
  sid: 'SID',
  star: 'STAR',
  trans: 'TRANSITIONS',
  pr: 'RESTRICTED AREAS',
  dng: 'DANGER AREAS',
  tra: 'TRA',
  adiz: 'ADIZ',
  civt: 'CIVIL TRAINING',
  ctr: 'CTR',
  tma: 'TMA',
  cta: 'CTA',
  advisory: 'ADVISORY AREAS',
  sector: 'SECTORS',
  fir: 'FIR',
  asr: 'ALTIMETER SETTING',
  coast: 'COASTLINE',
  rings: 'RANGE RINGS',
};

const NAVAID_MAX_RANGE = 120;

/** Navaids clutter a wide range; they show only out to `NAVAID_MAX_RANGE`. */
export function navaidsShownAt(rangeNm: number): boolean {
  return rangeNm <= NAVAID_MAX_RANGE;
}

/**
 * The layers to build: those shown, and the navaids only when the range allows. The range is
 * read only for a shown navaid layer, so a rebuild follows it only then.
 */
export function visibleLayers(
  layers: readonly StyledLayer[],
  shown: (layer: StyledLayer) => boolean,
  navaidsInRange: () => boolean,
): StyledLayer[] {
  return layers.filter((l) => shown(l) && (l !== 'navaid' || navaidsInRange()));
}
