import { CHART_COLORS } from '../../design/palette';
import type { Layer } from '../../lib/mapsetFormat';
import { LABEL_DENSITIES, type LabelDensity } from '../../state/settingsDefaults';
import { Shape } from '../protocol';
import type { DashPattern, TextStyle } from './pack';

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
  baseline: NonNullable<TextStyle['baseline']>;
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

/** How a layer of points is drawn: as a marker, or as the navaid symbol of the point's kind. */
export interface PointLayerStyle {
  shape: Shape | 'symbol';
  size: number;
  color: string;
  label: PointLabelStyle;
}

/**
 * How holds are drawn: a racetrack in `rnavColor` for kind RNAV, else in `color`. Holds have no
 * label.
 */
export interface HoldLayerStyle {
  color: string;
  rnavColor: string;
  label?: undefined;
}

/** A layer's style: lines, points or holds. */
export type LayerStyle = LineLayerStyle | PointLayerStyle | HoldLayerStyle;

const SOLID: Refinement = { dash: [] };

/** A label's form but for its colour, which each layer gives. */
type PointLabelPlace = Omit<PointLabelStyle, 'color'>;

const AREA_LABEL: Omit<LabelStyle, 'color'> = { from: 'dense', size: 9 };
const ROUTE_LABEL: Omit<LabelStyle, 'color'> = { from: 'normal', size: 9 };
const FIX_LABEL: PointLabelPlace = {
  from: 'normal',
  size: 9,
  px: 5,
  py: -3,
  baseline: 'bottom',
};
const STATION_LABEL: PointLabelPlace = {
  from: 'sparse',
  size: 10,
  px: 8,
  py: -1,
  baseline: 'middle',
};

const line = (color: string, rest: Omit<LineLayerStyle, 'color'> = {}): LineLayerStyle => ({
  color,
  ...rest,
});

const areaLine = (
  color: string,
  labelColor: string,
  rest: Omit<LineLayerStyle, 'color' | 'label'> = {},
) => line(color, { ...rest, label: { ...AREA_LABEL, color: labelColor } });

/** The style of every layer that is drawn. Unknown kinds draw as their layer's default. */
export const LAYER_STYLES = {
  ad: {
    shape: Shape.Ring,
    size: 9,
    color: CHART_COLORS.ad,
    label: { ...STATION_LABEL, color: CHART_COLORS.adLabel },
  },
  navaid: {
    shape: 'symbol',
    size: 12,
    color: CHART_COLORS.navaid,
    label: { ...STATION_LABEL, color: CHART_COLORS.navaidLabel },
  },
  fix: {
    shape: Shape.Triangle,
    size: 8,
    color: CHART_COLORS.fix,
    label: { ...FIX_LABEL, color: CHART_COLORS.fixLabel },
  },
  vfr: {
    shape: Shape.Triangle,
    size: 6,
    color: CHART_COLORS.vfr,
    label: { ...FIX_LABEL, from: 'dense', color: CHART_COLORS.vfrLabel },
  },
  sid: line(CHART_COLORS.procedure, {
    label: { ...ROUTE_LABEL, from: 'dense', color: CHART_COLORS.procedureLabel },
  }),
  star: line(CHART_COLORS.procedure, {
    dash: [6, 3],
    label: { ...ROUTE_LABEL, from: 'dense', color: CHART_COLORS.procedureLabel },
  }),
  trans: line(CHART_COLORS.procedure, {
    dash: [10, 4],
    label: { ...ROUTE_LABEL, color: CHART_COLORS.procedureLabel },
  }),
  conv: line(CHART_COLORS.conv, { label: { ...ROUTE_LABEL, color: CHART_COLORS.convLabel } }),
  rnav: line(CHART_COLORS.rnav, { label: { ...ROUTE_LABEL, color: CHART_COLORS.rnavLabel } }),
  dct: line(CHART_COLORS.conv, { width: 0.5 }),
  hold: { color: CHART_COLORS.conv, rnavColor: CHART_COLORS.rnav, label: undefined },
  ctr: areaLine(CHART_COLORS.airspace, CHART_COLORS.airspaceLabel),
  pr: areaLine(CHART_COLORS.airspace, CHART_COLORS.airspaceLabel, {
    dash: [4, 3],
    kinds: new Map([['P', SOLID]]),
  }),
  tma: areaLine(CHART_COLORS.airspaceDim, CHART_COLORS.airspaceLabel, {
    kinds: new Map([['MIL', { dash: [8, 3] }]]),
  }),
  sector: line(CHART_COLORS.sector, {
    dash: [6, 4],
    upper: { dash: [12, 4] },
    label: { ...AREA_LABEL, from: 'normal', size: 10, color: CHART_COLORS.sectorLabel },
  }),
  fir: line(CHART_COLORS.fir, { dash: [16, 5] }),
  dng: areaLine(CHART_COLORS.airspaceDim, CHART_COLORS.airspaceLabel, { dash: [4, 3] }),
  tra: areaLine(CHART_COLORS.airspaceDim, CHART_COLORS.airspaceLabel, { dash: [4, 3] }),
  adiz: line(CHART_COLORS.boundaryDim, { dash: [16, 4, 2, 4] }),
  cta: areaLine(CHART_COLORS.airspaceDim, CHART_COLORS.airspaceLabel, {
    kinds: new Map([['PCA', { dash: [12, 6] }]]),
  }),
  advisory: areaLine(CHART_COLORS.airspaceDim, CHART_COLORS.airspaceLabel, { dash: [10, 3, 2, 3] }),
  civt: areaLine(CHART_COLORS.airspaceDim, CHART_COLORS.airspaceLabel, { dash: [2, 3] }),
  asr: areaLine(CHART_COLORS.boundaryDim, CHART_COLORS.sectorLabel, { dash: [2, 4] }),
} satisfies Record<Layer, LayerStyle>;

/** Whether a label is drawn at `density`: from its layer's own density up. */
export const labelReaches = (label: LabelStyle, density: LabelDensity): boolean =>
  LABEL_DENSITIES.indexOf(density) >= LABEL_DENSITIES.indexOf(label.from);

export const isPointStyle = (style: LayerStyle): style is PointLayerStyle => 'shape' in style;

export const isHoldStyle = (style: LayerStyle): style is HoldLayerStyle => 'rnavColor' in style;
