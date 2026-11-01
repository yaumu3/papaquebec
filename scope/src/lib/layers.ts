import { CHART_COLORS } from '../design/palette';
import { isScopeLayer, type ScopeLayer } from './mapsetFormat';

/** How much of the chart is named: off, then each density adding to the one before. */
export type LabelDensity = 'off' | 'sparse' | 'normal' | 'dense';

export const LABEL_DENSITIES: readonly LabelDensity[] = ['off', 'sparse', 'normal', 'dense'];

/** Alternating on and off lengths in CSS px, up to two pairs; empty is solid. */
export type DashPattern =
  | readonly []
  | readonly [number, number]
  | readonly [number, number, number, number];

/** The width of a line whose style names none, CSS px. */
export const DEFAULT_LINE_WIDTH = 1;

/** What a kind or an upper stratum changes in a line's look. */
interface Refinement {
  dash: DashPattern;
}

/** How a layer's items are named on the chart: from which label density up, and in what. */
export interface LabelStyle {
  from: Exclude<LabelDensity, 'off'>;
  color: string;
  size: number;
}

/** A point's ident hangs off its marker. */
interface PointLabelStyle extends LabelStyle {
  /** CSS px from the anchor. */
  px: number;
  py: number;
  baseline: 'middle' | 'bottom';
}

/** How a layer of lines is drawn: its colour and form, refined by a part's kind or stratum. */
export interface LineLayerStyle {
  color: string;
  width?: number;
  dash?: DashPattern;
  kinds?: ReadonlyMap<string, Refinement>;
  upper?: Refinement;
  label?: LabelStyle;
}

/** How a layer of points is drawn: by a marker, or by the navaid symbol of the point's kind. */
export interface PointLayerStyle {
  marker: 'ring' | 'triangle' | 'navaid';
  size: number;
  color: string;
  label: PointLabelStyle;
}

/** How holds are drawn: a racetrack in `rnavColor` for kind RNAV, else in `color`. No label. */
export interface HoldLayerStyle {
  color: string;
  rnavColor: string;
  label?: undefined;
}

/** A layer's style: lines, points or holds. */
export type LayerStyle = LineLayerStyle | PointLayerStyle | HoldLayerStyle;

/** What the scope knows about a layer besides the geometry of its features. */
interface LayerRow<S extends LayerStyle = LayerStyle> {
  /** The group of the Maps panel it is listed in. */
  group: string;
  /** What the Maps panel calls it. */
  name: string;
  /** Where the AIP describes it, if it does. */
  aip?: string;
  /** Whether it is shown until the operator says otherwise. */
  shown: boolean;
  /** Where it stands in the draw order: a lower rank draws over a higher one. */
  rank: number;
  /** A route a pilot files by its designator, which ENR 3 of the AIP lists. */
  airway?: boolean;
  /** The range cursor snaps to its points. */
  snaps?: boolean;
  style: S;
}

/** The maker of the rows of a group of the Maps panel. */
const rowsOf =
  (group: string) =>
  <S extends LayerStyle>(fields: Omit<LayerRow<S>, 'group'>): LayerRow<S> => ({ ...fields, group });

const point = rowsOf('POINTS');
const route = rowsOf('ROUTES');
const procedure = rowsOf('PROCEDURES');
const restriction = rowsOf('RESTRICTIONS');
const airspace = rowsOf('AIRSPACE');
const baseMap = rowsOf('BASE MAP');

const SOLID: Refinement = { dash: [] };

const AREA_LABEL = { from: 'dense', size: 9 } as const;
const ROUTE_LABEL = { from: 'normal', size: 9 } as const;
const FIX_LABEL = { from: 'normal', size: 9, px: 5, py: -3, baseline: 'bottom' } as const;
const STATION_LABEL = { from: 'sparse', size: 10, px: 8, py: -1, baseline: 'middle' } as const;

const line = (color: string, rest: Omit<LineLayerStyle, 'color'> = {}): LineLayerStyle => ({
  color,
  ...rest,
});

const areaLine = (
  color: string,
  labelColor: string,
  rest: Omit<LineLayerStyle, 'color' | 'label'> = {},
) => line(color, { ...rest, label: { ...AREA_LABEL, color: labelColor } });

const C = CHART_COLORS;

/**
 * Everything the scope knows about a layer, one row each, in the order the Maps panel lists them.
 * The draw order is the rank: what ranks first draws over everything after it. Points go over
 * procedures over routes; among areas, the boundaries an operator works to go over those that
 * only give context; the base map is behind all of it. Unknown kinds draw as their layer's default.
 */
export const LAYER_TABLE = {
  ad: point({
    name: 'AERODROMES',
    aip: 'AD 2',
    shown: true,
    rank: 0,
    style: {
      marker: 'ring',
      size: 9,
      color: C.ad,
      label: { ...STATION_LABEL, color: C.adLabel },
    },
  }),
  navaid: point({
    name: 'NAVAIDS',
    aip: 'ENR 4.1',
    shown: true,
    rank: 1,
    snaps: true,
    style: {
      marker: 'navaid',
      size: 12,
      color: C.navaid,
      label: { ...STATION_LABEL, color: C.navaidLabel },
    },
  }),
  fix: point({
    name: 'FIXES',
    aip: 'ENR 4.4',
    shown: true,
    rank: 2,
    snaps: true,
    style: {
      marker: 'triangle',
      size: 8,
      color: C.fix,
      label: { ...FIX_LABEL, color: C.fixLabel },
    },
  }),
  vfr: point({
    name: 'VFR POINTS',
    aip: 'AD 2.24 visual approach charts',
    shown: false,
    rank: 3,
    snaps: true,
    style: {
      marker: 'triangle',
      size: 6,
      color: C.vfr,
      label: { ...FIX_LABEL, from: 'dense', color: C.vfrLabel },
    },
  }),
  conv: route({
    name: 'CONVENTIONAL',
    aip: 'ENR 3',
    shown: true,
    rank: 7,
    airway: true,
    style: line(C.conv, { label: { ...ROUTE_LABEL, color: C.convLabel } }),
  }),
  rnav: route({
    name: 'RNAV',
    aip: 'ENR 3',
    shown: true,
    rank: 8,
    airway: true,
    style: line(C.rnav, { label: { ...ROUTE_LABEL, color: C.rnavLabel } }),
  }),
  dct: route({
    name: 'DCT',
    aip: 'ENR 3, other routes',
    shown: false,
    rank: 9,
    style: line(C.conv, { width: 0.5 }),
  }),
  hold: route({
    name: 'EN-ROUTE HOLDING',
    aip: 'ENR 3, en-route holding',
    shown: false,
    rank: 10,
    style: { color: C.conv, rnavColor: C.rnav, label: undefined },
  }),
  sid: procedure({
    name: 'SID',
    aip: 'AD 2.22',
    shown: false,
    rank: 4,
    style: line(C.procedure, {
      label: { ...ROUTE_LABEL, from: 'dense', color: C.procedureLabel },
    }),
  }),
  star: procedure({
    name: 'STAR',
    aip: 'AD 2.22',
    shown: false,
    rank: 5,
    style: line(C.procedure, {
      dash: [6, 3],
      label: { ...ROUTE_LABEL, from: 'dense', color: C.procedureLabel },
    }),
  }),
  trans: procedure({
    name: 'TRANSITIONS',
    aip: 'AD 2.22',
    shown: false,
    rank: 6,
    style: line(C.procedure, {
      dash: [10, 4],
      label: { ...ROUTE_LABEL, color: C.procedureLabel },
    }),
  }),
  pr: restriction({
    name: 'RESTRICTED AREAS',
    aip: 'ENR 5.1',
    shown: true,
    rank: 12,
    style: areaLine(C.airspace, C.airspaceLabel, { dash: [4, 3], kinds: new Map([['P', SOLID]]) }),
  }),
  dng: restriction({
    name: 'DANGER AREAS',
    aip: 'ENR 5.1',
    shown: true,
    rank: 16,
    style: areaLine(C.airspaceDim, C.airspaceLabel, { dash: [4, 3] }),
  }),
  tra: restriction({
    name: 'TRA',
    aip: 'ENR 5.2',
    shown: false,
    rank: 17,
    style: areaLine(C.airspaceDim, C.airspaceLabel, { dash: [4, 3] }),
  }),
  adiz: restriction({
    name: 'ADIZ',
    aip: 'ENR 5.2',
    shown: false,
    rank: 18,
    style: line(C.boundaryDim, { dash: [16, 4, 2, 4] }),
  }),
  civt: restriction({
    name: 'CIVIL TRAINING',
    shown: false,
    rank: 21,
    style: areaLine(C.airspaceDim, C.airspaceLabel, { dash: [2, 3] }),
  }),
  ctr: airspace({
    name: 'CTR',
    aip: 'AD 2.17',
    shown: true,
    rank: 11,
    style: areaLine(C.airspace, C.airspaceLabel),
  }),
  tma: airspace({
    name: 'TMA',
    aip: 'ENR 2.1',
    shown: true,
    rank: 13,
    style: areaLine(C.airspaceDim, C.airspaceLabel, {
      kinds: new Map([['MIL', { dash: [8, 3] }]]),
    }),
  }),
  cta: airspace({
    name: 'CTA',
    aip: 'ENR 2.1',
    shown: false,
    rank: 19,
    style: areaLine(C.airspaceDim, C.airspaceLabel, {
      kinds: new Map([['PCA', { dash: [12, 6] }]]),
    }),
  }),
  advisory: airspace({
    name: 'ADVISORY AREAS',
    aip: 'ENR 2.2',
    shown: false,
    rank: 20,
    style: areaLine(C.airspaceDim, C.airspaceLabel, { dash: [10, 3, 2, 3] }),
  }),
  sector: airspace({
    name: 'SECTORS',
    shown: true,
    rank: 14,
    style: line(C.sector, {
      dash: [6, 4],
      upper: { dash: [12, 4] },
      label: { ...AREA_LABEL, from: 'normal', size: 10, color: C.sectorLabel },
    }),
  }),
  fir: airspace({
    name: 'FIR',
    aip: 'ENR 2.1',
    shown: true,
    rank: 15,
    style: line(C.fir, { dash: [16, 5] }),
  }),
  asr: airspace({
    name: 'ALTIMETER SETTING',
    aip: 'ENR 1.7',
    shown: false,
    rank: 22,
    style: areaLine(C.boundaryDim, C.sectorLabel, { dash: [2, 4] }),
  }),
  coast: baseMap({
    name: 'COASTLINE',
    shown: true,
    rank: 23,
    style: line(C.coast),
  }),
  rings: baseMap({
    name: 'RANGE RINGS',
    shown: true,
    rank: 24,
    style: line(C.ringEdge),
  }),
} satisfies Record<ScopeLayer, LayerRow>;

/** Every layer in the order the Maps panel lists them. */
const PANEL_ORDER: readonly ScopeLayer[] = Object.keys(LAYER_TABLE).filter(isScopeLayer);

/** Every layer the scope draws, front first. */
export const DRAW_STACK: readonly ScopeLayer[] = PANEL_ORDER.toSorted(
  (a, b) => LAYER_TABLE[a].rank - LAYER_TABLE[b].rank,
);

/** The groups of the Maps panel, in the order they are listed there. */
export const LAYER_GROUPS: readonly { title: string; layers: readonly ScopeLayer[] }[] = [
  ...new Set(PANEL_ORDER.map((layer) => LAYER_TABLE[layer].group)),
].map((title) => ({
  title,
  layers: PANEL_ORDER.filter((layer) => LAYER_TABLE[layer].group === title),
}));

/** Each layer's mode until the operator says otherwise. */
export const DEFAULT_SHOWN = Object.fromEntries(
  PANEL_ORDER.map((layer) => [layer, LAYER_TABLE[layer].shown]),
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every layer has a row
) as Record<ScopeLayer, boolean>;

export const isAirwayLayer = (layer: ScopeLayer): boolean => LAYER_TABLE[layer].airway === true;

export const isSnapLayer = (layer: ScopeLayer): boolean => LAYER_TABLE[layer].snaps === true;

/** The layers of the procedures, which AD 2.22 of the AIP lists: departures, arrivals, transitions. */
export const isProcedureLayer = (layer: ScopeLayer): boolean =>
  LAYER_TABLE[layer].group === 'PROCEDURES';

/** Whether a label is drawn at `density`: from its layer's own density up. */
export const labelReaches = (label: LabelStyle, density: LabelDensity): boolean =>
  LABEL_DENSITIES.indexOf(density) >= LABEL_DENSITIES.indexOf(label.from);

export const isPointStyle = (style: LayerStyle): style is PointLayerStyle => 'marker' in style;

export const isHoldStyle = (style: LayerStyle): style is HoldLayerStyle => 'rnavColor' in style;
