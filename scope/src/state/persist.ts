import type { Altimeter } from '../lib/altitude';
import { isRecord } from '../lib/guards';
import { DRAW_STACK, LABEL_DENSITIES, LAYER_GROUPS } from '../lib/layers';
import { type Filter, FL_MAX, FL_MIN, type SquawkFilter } from './filter';
import { isLaneKey, type LaneKey } from './plotted';
import {
  ND_RANGES_NM,
  type NdRangeNm,
  type Panels,
  QNH_MAX_INHG,
  type QnhSetting,
  STATION_RE,
  type ListSort,
  SORT_DIRS,
  SORT_KEYS,
  QNH_MIN_INHG,
  RANGE_MAX_NM,
  RANGE_MIN_NM,
  type Exceptions,
  type Settings,
  type ShownLayers,
  TRANSITION_ALT_MAX_FT,
  TRAIL_STEPS,
  VECTOR_STEPS,
} from './settingsDefaults';
import { readJson, writeJson } from './storageJson';

export const PERSIST_KEY = 'papaquebec.settings';

export interface Persisted {
  settings: Settings;
  panels: Panels;
  listSort: ListSort;
  /** The lanes of the detail column, in order. */
  plotted: readonly LaneKey[];
  /** The range of the ND, one for all targets. */
  ndRangeNm: NdRangeNm;
}

/** A stored value read back; what is unexpected in it gives way to the fallback. */
type Loader<T> = (raw: unknown, fallback: T) => T;

const flag: Loader<boolean> = (raw, fallback) => (typeof raw === 'boolean' ? raw : fallback);

const anyNumber: Loader<number> = (raw, fallback) => (typeof raw === 'number' ? raw : fallback);

const numberIn =
  (min: number, max: number): Loader<number> =>
  (raw, fallback) =>
    typeof raw === 'number' && raw >= min && raw <= max ? raw : fallback;

const oneOf =
  <T>(values: readonly T[]): Loader<T> =>
  (raw, fallback) =>
    values.find((value) => value === raw) ?? fallback;

/** The members of `among` the list holds; an empty list is a choice to hold nothing. */
const known =
  <T>(among: readonly T[]): Loader<readonly T[]> =>
  (raw, fallback) =>
    Array.isArray(raw) ? among.filter((x) => raw.includes(x)) : fallback;

/** A list of strings; anything else in it, or no list at all, is junk. */
const strings: Loader<readonly string[]> = (raw, fallback) =>
  Array.isArray(raw) && raw.every((x) => typeof x === 'string') ? raw : fallback;

/** Each field by its own loader, so junk in one costs only that one. */
const fields =
  <T extends object>(loaders: { [K in keyof T]: Loader<T[K]> }): Loader<T> =>
  (raw, fallback) => {
    if (!isRecord(raw)) return fallback;
    const out = { ...fallback };
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the keys of `loaders` are those of T
    for (const key of Object.keys(loaders) as (keyof T & string)[]) {
      out[key] = loaders[key](raw[key], fallback[key]);
    }
    return out;
  };

const looseFilter = fields<Filter>({
  ground: flag,
  squawk: oneOf<SquawkFilter>(['all', 'nonvfr', 'emergency']),
  lowerFl: anyNumber,
  upperFl: anyNumber,
});

/** The edges of the band stand or fall together. */
const filter: Loader<Filter> = (raw, fallback) => {
  const read = looseFilter(raw, fallback);
  const { lowerFl, upperFl } = read;
  return lowerFl >= FL_MIN && lowerFl < upperFl && upperFl <= FL_MAX
    ? read
    : { ...read, lowerFl: fallback.lowerFl, upperFl: fallback.upperFl };
};

const shownLayers: Loader<ShownLayers> = (raw, fallback) => {
  const saved = isRecord(raw) ? raw : {};
  const out = { ...fallback };
  for (const layer of DRAW_STACK) out[layer] = flag(saved[layer], fallback[layer]);
  return out;
};

/** The exceptions saved for each layer, in order; layers and values not known are dropped. */
const exceptions: Loader<Exceptions> = (raw, fallback) => {
  if (!isRecord(raw)) return fallback;
  const out: Exceptions = {};
  for (const layer of DRAW_STACK) {
    const keys = raw[layer];
    if (Array.isArray(keys)) out[layer] = new Set(keys.filter((k) => typeof k === 'string'));
  }
  return out;
};

const station: Loader<string> = (raw, fallback) =>
  typeof raw === 'string' && (raw === '' || STATION_RE.test(raw)) ? raw : fallback;

const settings = fields<Settings>({
  rangeNm: numberIn(RANGE_MIN_NM, RANGE_MAX_NM),
  vectorMin: oneOf<number>(VECTOR_STEPS),
  trailSec: oneOf<number>(TRAIL_STEPS),
  filter,
  shownLayers,
  exceptions,
  disabledSets: strings,
  openGroups: known(LAYER_GROUPS.map((group) => group.title)),
  openLayers: known<string>(DRAW_STACK),
  labelDensity: oneOf(LABEL_DENSITIES),
  altimeter: fields<Altimeter>({
    transitionAltFt: numberIn(0, TRANSITION_ALT_MAX_FT),
    qnhInHg: numberIn(QNH_MIN_INHG, QNH_MAX_INHG),
  }),
  qnh: fields<QnhSetting>({ auto: flag, station }),
});

/** The lanes known, each once; an empty list is a choice to plot nothing. */
const plotted: Loader<readonly LaneKey[]> = (raw, fallback) =>
  Array.isArray(raw) ? [...new Set(raw.filter(isLaneKey))] : fallback;

const persisted = fields<Persisted>({
  settings,
  panels: fields<Panels>({ display: flag, maps: flag, list: flag, detail: flag }),
  listSort: fields<ListSort>({ key: oneOf(SORT_KEYS), dir: oneOf(SORT_DIRS) }),
  plotted,
  ndRangeNm: oneOf(ND_RANGES_NM),
});

/** Field-by-field validation: anything unexpected falls back to the default for that field. */
export function loadPersisted(storage: Storage, defaults: Persisted): Persisted {
  const raw = readJson(storage, PERSIST_KEY);
  return persisted(isRecord(raw) ? raw : {}, defaults);
}

/** Sets are written as lists; JSON has no set. */
const asArrays = (byLayer: Exceptions) =>
  Object.fromEntries(Object.entries(byLayer).map(([layer, keys]) => [layer, [...keys]]));

/** Best effort: the scope works without storage. */
export function savePersisted(storage: Storage, state: Persisted): void {
  writeJson(storage, PERSIST_KEY, {
    ...state,
    settings: { ...state.settings, exceptions: asArrays(state.settings.exceptions) },
  });
}
