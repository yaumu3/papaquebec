import type { StyledLayer } from '../../lib/layers';
import { Shape } from '../protocol';
import type { DashPattern } from './pack';
import { THEME } from './rules';

/** What a kind or an upper stratum changes in a line's look. */
interface Refinement {
  dash: DashPattern;
}

/** How a layer of lines is drawn: its colour and form, refined by a part's kind or stratum. */
export interface LineLayerStyle {
  color: string;
  width?: number;
  dash?: DashPattern;
  kinds?: ReadonlyMap<string, Refinement>;
  upper?: Refinement;
}

/** How a layer of points is drawn. */
interface PointLayerStyle {
  shape: Shape;
  size: number;
  color: string;
}

/** A layer's style: lines or points. */
export type LayerStyle = LineLayerStyle | PointLayerStyle;

const SOLID: Refinement = { dash: [] };

const line = (color: string, rest: Omit<LineLayerStyle, 'color'> = {}): LineLayerStyle => ({
  color,
  ...rest,
});

/** The style of every layer that is drawn. Unknown kinds draw as their layer's default. */
export const LAYER_STYLES: Record<StyledLayer, LayerStyle> = {
  ad: { shape: Shape.Ring, size: 9, color: THEME.ad },
  navaid: { shape: Shape.Hexagon, size: 10, color: THEME.navaid },
  fix: { shape: Shape.Triangle, size: 8, color: THEME.fix },
  vfr: { shape: Shape.Triangle, size: 6, color: THEME.vfr },
  sid: line(THEME.procedure),
  star: line(THEME.procedure, { dash: [6, 3] }),
  trans: line(THEME.procedure, { dash: [10, 4] }),
  conv: line(THEME.conv),
  rnav: line(THEME.rnav),
  dct: line(THEME.conv, { width: 0.5 }),
  ctr: line(THEME.airspace),
  pr: line(THEME.airspace, { dash: [4, 3], kinds: new Map([['P', SOLID]]) }),
  tma: line(THEME.airspaceDim, { kinds: new Map([['MIL', { dash: [8, 3] }]]) }),
  sector: line(THEME.sector, { dash: [6, 4], upper: { dash: [12, 4] } }),
  fir: line(THEME.fir, { dash: [16, 5] }),
  dng: line(THEME.airspaceDim, { dash: [4, 3] }),
  tra: line(THEME.airspaceDim, { dash: [4, 3] }),
  adiz: line(THEME.boundaryDim, { dash: [16, 4, 2, 4] }),
  cta: line(THEME.airspaceDim, { kinds: new Map([['PCA', { dash: [12, 6] }]]) }),
  advisory: line(THEME.airspaceDim, { dash: [10, 3, 2, 3] }),
  civt: line(THEME.airspaceDim, { dash: [2, 3] }),
  asr: line(THEME.boundaryDim, { dash: [2, 4] }),
};

export const isPointStyle = (style: LayerStyle): style is PointLayerStyle => 'shape' in style;
