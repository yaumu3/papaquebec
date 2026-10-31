import type { StyledLayer } from '../../lib/layers';
import type { LabelDensity } from '../../state/settingsDefaults';
import { Shape } from '../protocol';
import type { DashPattern, TextStyle } from './pack';
import { THEME } from './rules';

/** What a kind or an upper stratum changes in a line's look. */
interface Refinement {
  dash: DashPattern;
}

/** How a layer's items are named on the chart: from which label density up, and where. */
interface LabelStyle {
  from: Exclude<LabelDensity, 'off'>;
  color: string;
  size: number;
  /** CSS px from the anchor. */
  px: number;
  py: number;
  baseline: NonNullable<TextStyle['baseline']>;
  /** Where on the item's first path the label hangs. */
  at: 'first' | 'middle';
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

/** How a layer of points is drawn. */
interface PointLayerStyle {
  shape: Shape;
  size: number;
  color: string;
  label: LabelStyle;
}

/** A layer's style: lines or points. */
export type LayerStyle = LineLayerStyle | PointLayerStyle;

const SOLID: Refinement = { dash: [] };

/** A label's form but for its colour, which each layer gives. */
type LabelPlace = Omit<LabelStyle, 'color'>;

const AREA_LABEL: LabelPlace = {
  from: 'dense',
  size: 9,
  px: 4,
  py: 2,
  baseline: 'top',
  at: 'first',
};
const ROUTE_LABEL: LabelPlace = {
  from: 'normal',
  size: 9,
  px: 4,
  py: -6,
  baseline: 'bottom',
  at: 'middle',
};
const FIX_LABEL: LabelPlace = {
  from: 'normal',
  size: 9,
  px: 5,
  py: -3,
  baseline: 'bottom',
  at: 'first',
};
const STATION_LABEL: LabelPlace = {
  from: 'sparse',
  size: 10,
  px: 8,
  py: -1,
  baseline: 'middle',
  at: 'first',
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
export const LAYER_STYLES: Record<StyledLayer, LayerStyle> = {
  ad: {
    shape: Shape.Ring,
    size: 9,
    color: THEME.ad,
    label: { ...STATION_LABEL, color: THEME.adLabel },
  },
  navaid: {
    shape: Shape.Hexagon,
    size: 10,
    color: THEME.navaid,
    label: { ...STATION_LABEL, color: THEME.navaidLabel },
  },
  fix: {
    shape: Shape.Triangle,
    size: 8,
    color: THEME.fix,
    label: { ...FIX_LABEL, color: THEME.fixLabel },
  },
  vfr: {
    shape: Shape.Triangle,
    size: 6,
    color: THEME.vfr,
    label: { ...FIX_LABEL, from: 'dense', color: THEME.vfrLabel },
  },
  sid: line(THEME.procedure, {
    label: { ...ROUTE_LABEL, from: 'dense', color: THEME.procedureLabel },
  }),
  star: line(THEME.procedure, {
    dash: [6, 3],
    label: { ...ROUTE_LABEL, from: 'dense', color: THEME.procedureLabel },
  }),
  trans: line(THEME.procedure, {
    dash: [10, 4],
    label: { ...ROUTE_LABEL, color: THEME.procedureLabel },
  }),
  conv: line(THEME.conv, { label: { ...ROUTE_LABEL, color: THEME.convLabel } }),
  rnav: line(THEME.rnav, { label: { ...ROUTE_LABEL, color: THEME.rnavLabel } }),
  dct: line(THEME.conv, { width: 0.5 }),
  ctr: areaLine(THEME.airspace, THEME.airspaceLabel),
  pr: areaLine(THEME.airspace, THEME.airspaceLabel, {
    dash: [4, 3],
    kinds: new Map([['P', SOLID]]),
  }),
  tma: areaLine(THEME.airspaceDim, THEME.airspaceLabel, {
    kinds: new Map([['MIL', { dash: [8, 3] }]]),
  }),
  sector: line(THEME.sector, {
    dash: [6, 4],
    upper: { dash: [12, 4] },
    label: { ...AREA_LABEL, from: 'normal', color: THEME.sectorLabel },
  }),
  fir: line(THEME.fir, { dash: [16, 5] }),
  dng: areaLine(THEME.airspaceDim, THEME.airspaceLabel, { dash: [4, 3] }),
  tra: areaLine(THEME.airspaceDim, THEME.airspaceLabel, { dash: [4, 3] }),
  adiz: line(THEME.boundaryDim, { dash: [16, 4, 2, 4] }),
  cta: areaLine(THEME.airspaceDim, THEME.airspaceLabel, {
    kinds: new Map([['PCA', { dash: [12, 6] }]]),
  }),
  advisory: areaLine(THEME.airspaceDim, THEME.airspaceLabel, { dash: [10, 3, 2, 3] }),
  civt: areaLine(THEME.airspaceDim, THEME.airspaceLabel, { dash: [2, 3] }),
  asr: areaLine(THEME.boundaryDim, THEME.sectorLabel, { dash: [2, 4] }),
};

export const isPointStyle = (style: LayerStyle): style is PointLayerStyle => 'shape' in style;
