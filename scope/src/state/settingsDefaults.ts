import { type Altimeter, STANDARD_ALTIMETER } from '../lib/altitude';
import type { ScopeLayer } from '../lib/layers';
import { FL_MAX, type Filter } from './filter';

/** Range presets on the Display panel; the wheel zooms continuously between the limits. */
export const RANGE_STEPS = [10, 20, 40, 80, 200] as const;
export const RANGE_MIN_NM = 5;
export const RANGE_MAX_NM = 400;
export const VECTOR_STEPS = [0, 0.5, 1, 2] as const;
export const TRAIL_STEPS = [0, 30, 60, 120] as const;

/** Whether each layer is drawn. */
export type ShownLayers = Record<ScopeLayer, boolean>;
export type LabelDensity = 'off' | 'sparse' | 'normal' | 'dense';

export const LABEL_DENSITIES: readonly LabelDensity[] = ['off', 'sparse', 'normal', 'dense'];

export interface Settings {
  /** Radius shown by the shorter canvas edge, NM. */
  rangeNm: number;
  /** Minutes of travel the vector shows; 0 hides it. */
  vectorMin: number;
  /** Seconds of trail; 0 hides it. */
  trailSec: number;
  filter: Filter;
  shownLayers: ShownLayers;
  labelDensity: LabelDensity;
  altimeter: Altimeter;
  qnh: QnhSetting;
}

/** Where the altimeter setting comes from: a METAR station, applied automatically or not. */
export interface QnhSetting {
  auto: boolean;
  /** ICAO station id; empty means the airport nearest the site. */
  station: string;
}

export const STATION_RE = /^[A-Z][A-Z0-9]{3}$/;

export const TRANSITION_ALT_MAX_FT = 30000;
export const QNH_MIN_INHG = 27.5;
export const QNH_MAX_INHG = 31.5;

export const DEFAULT_SETTINGS: Settings = {
  rangeNm: 40,
  vectorMin: 2,
  trailSec: 60,
  filter: { ground: true, lowerFl: 0, upperFl: FL_MAX, squawk: 'all' },
  shownLayers: {
    ad: true,
    navaid: true,
    fix: true,
    vfr: false,
    sid: false,
    star: false,
    trans: false,
    conv: true,
    rnav: true,
    dct: false,
    hold: false,
    ctr: true,
    pr: true,
    tma: true,
    sector: true,
    fir: true,
    dng: true,
    tra: false,
    adiz: false,
    cta: false,
    advisory: false,
    civt: false,
    asr: false,
    coast: true,
    rings: true,
  },
  labelDensity: 'normal',
  altimeter: { ...STANDARD_ALTIMETER },
  qnh: { auto: true, station: '' },
};

export type PanelId = 'display' | 'maps' | 'list' | 'detail';
export type Panels = Record<PanelId, boolean>;
/** Every panel, in the order the bars list them. */
export const PANEL_IDS: readonly PanelId[] = ['display', 'maps', 'list', 'detail'];
export const DEFAULT_PANELS: Panels = { display: true, maps: true, list: true, detail: true };

/** The ranges of the ND, in nautical miles, from the closest in. */
export const ND_RANGES_NM = [10, 20, 40, 80] as const;
export type NdRangeNm = (typeof ND_RANGES_NM)[number];
/** The range the ND opens on. */
export const DEFAULT_ND_RANGE_NM: NdRangeNm = 20;
