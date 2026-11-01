import type { Chart, ChartItem } from './chart';
import type { Layer } from './mapsetFormat';
import { isItemShown, type LayerState } from './visibility';

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

/** Whether the scope makes a layer itself, from no map set: the coastline and the range rings. */
export const isScopeMade = (layer: ScopeLayer) => layer === 'coast' || layer === 'rings';

/** Whether a layer has a style: not `hold`, and not the two the scope makes itself. */
export const isStyled = (layer: ScopeLayer) => layer !== 'hold' && !isScopeMade(layer);

/**
 * The layers of the airways, which ENR 3 of the AIP lists: a route a pilot files by its
 * designator. Direct routes and procedures are not airways.
 */
export const AIRWAY_LAYERS = ['conv', 'rnav'] as const satisfies readonly Layer[];

export const isAirwayLayer = (layer: ScopeLayer): layer is (typeof AIRWAY_LAYERS)[number] =>
  (AIRWAY_LAYERS as readonly ScopeLayer[]).includes(layer);

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

/** Where the AIP describes a layer, for the layers it describes. */
export const LAYER_AIP_REFS: Partial<Record<ScopeLayer, string>> = {
  ad: 'AD 2',
  vfr: 'AD 2.24 visual approach charts',
  navaid: 'ENR 4.1',
  fix: 'ENR 4.4',
  conv: 'ENR 3',
  rnav: 'ENR 3',
  dct: 'ENR 3, other routes',
  hold: 'ENR 3, en-route holding',
  sid: 'AD 2.22',
  star: 'AD 2.22',
  trans: 'AD 2.22',
  pr: 'ENR 5.1',
  dng: 'ENR 5.1',
  tra: 'ENR 5.2',
  adiz: 'ENR 5.2',
  ctr: 'AD 2.17',
  tma: 'ENR 2.1',
  cta: 'ENR 2.1',
  advisory: 'ENR 2.2',
  fir: 'ENR 2.1',
  asr: 'ENR 1.7',
};

const NAVAID_MAX_RANGE = 120;

/** Navaids clutter a wide range; they show only out to `NAVAID_MAX_RANGE`. */
export function navaidsShownAt(rangeNm: number): boolean {
  return rangeNm <= NAVAID_MAX_RANGE;
}

/**
 * The items of the chart that draw: of `layers`, those shown, and the navaids only when the range
 * allows. Each layer's state and the range are read once; the range only for a shown navaid, so a
 * rebuild follows it only then.
 */
export function drawnItemsOf(
  chart: Chart,
  layers: readonly Layer[],
  stateOf: (layer: Layer) => LayerState,
  navaidsInRange: () => boolean,
): ChartItem[] {
  const states = new Map(layers.map((layer) => [layer, stateOf(layer)]));
  const items = chart.filter((item) => {
    const state = states.get(item.layer);
    return state !== undefined && isItemShown(state, item.key);
  });
  return items.some((item) => item.layer === 'navaid') && !navaidsInRange()
    ? items.filter((item) => item.layer !== 'navaid')
    : items;
}
