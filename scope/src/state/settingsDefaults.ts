import { type Altimeter, STANDARD_ALTIMETER } from '../lib/altitude';
import { DEFAULT_SHOWN, type LabelDensity } from '../lib/layers';
import type { ScopeLayer } from '../lib/mapsetFormat';
import { FL_MAX, type Filter } from './filter';

/** Range presets on the Display panel; the wheel zooms continuously between the limits. */
export const RANGE_STEPS = [10, 20, 40, 80, 200] as const;
export const RANGE_MIN_NM = 5;
export const RANGE_MAX_NM = 400;
export const VECTOR_STEPS = [0, 0.5, 1, 2] as const;
export const TRAIL_STEPS = [0, 30, 60, 120] as const;

/** Each layer's mode: shown or hidden, before its exceptions. */
export type ShownLayers = Record<ScopeLayer, boolean>;
/** The item keys of each layer that go against its `shownLayers` flag, oldest first. */
export type Exceptions = Partial<Record<ScopeLayer, ReadonlySet<string>>>;

export interface Settings {
  /** Radius shown by the shorter canvas edge, NM. */
  rangeNm: number;
  /** Minutes of travel the vector shows; 0 hides it. */
  vectorMin: number;
  /** Seconds of trail; 0 hides it. */
  trailSec: number;
  filter: Filter;
  shownLayers: ShownLayers;
  exceptions: Exceptions;
  /** The identities of the map sets switched off, the built-in one among them. */
  disabledSets: readonly string[];
  /** Titles of the tree's open groups. */
  openGroups: readonly string[];
  /** The tree's open layers. */
  openLayers: readonly string[];
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
  shownLayers: DEFAULT_SHOWN,
  exceptions: {},
  disabledSets: [],
  openGroups: [],
  openLayers: [],
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

export type SortKey = 'id' | 'type' | 'alt' | 'gs' | 'track' | 'squawk' | 'dist' | 'source';
export type SortDir = 'asc' | 'desc';
export const SORT_KEYS: readonly SortKey[] = [
  'id',
  'type',
  'alt',
  'gs',
  'track',
  'squawk',
  'dist',
  'source',
];
export const SORT_DIRS: readonly SortDir[] = ['asc', 'desc'];
export const DEFAULT_LIST_SORT: ListSort = { key: 'id', dir: 'asc' };

export interface ListSort {
  key: SortKey;
  dir: SortDir;
}
