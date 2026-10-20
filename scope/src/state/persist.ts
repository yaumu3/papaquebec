import type { Altimeter } from '../lib/altitude';
import { isRecord } from '../lib/guards';
import { type Filter, FL_MAX, FL_MIN, type SquawkFilter } from './filter';
import { type ListSort, SORT_DIRS, SORT_KEYS } from './listSort';
import { isLaneKey, type LaneKey, withInstruments } from './plotted';
import {
  DETAIL_TABS,
  type DetailTab,
  LABEL_DENSITIES,
  LAYER_KEYS,
  type Layers,
  ND_RANGES_NM,
  type NdRangeNm,
  PANEL_IDS,
  type Panels,
  QNH_MAX_INHG,
  type QnhSetting,
  STATION_RE,
  QNH_MIN_INHG,
  RANGE_MAX_NM,
  RANGE_MIN_NM,
  type Settings,
  TRANSITION_ALT_MAX_FT,
  TRAIL_STEPS,
  VECTOR_STEPS,
} from './settingsDefaults';
import { readJson, writeJson } from './storageJson';

export const PERSIST_KEY = 'papaquebec.settings';

/** The version of the lanes saved: 2 once instruments are lanes, which earlier saves lack. */
export const LANES_VERSION = 2;

export interface Persisted {
  settings: Settings;
  panels: Panels;
  listSort: ListSort;
  /** The lanes of the detail column, in order. */
  plotted: readonly LaneKey[];
  lanesVersion: typeof LANES_VERSION;
  /** The tab the detail panel has open. */
  detailTab: DetailTab;
  /** The range of the ND, one for all targets. */
  ndRangeNm: NdRangeNm;
}

const oneOf = <T>(steps: readonly T[], v: unknown, fallback: T): T =>
  steps.find((s) => s === v) ?? fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

const SQUAWK_FILTERS: readonly SquawkFilter[] = ['all', 'nonvfr', 'emergency'];

/** A saved upper edge past the top stop reads as UNL, as a typed one does; the stop itself may have moved. */
function filterFrom(raw: unknown, fallback: Filter): Filter {
  if (!isRecord(raw)) return fallback;
  const lower = typeof raw.lowerFl === 'number' ? raw.lowerFl : fallback.lowerFl;
  const upper = typeof raw.upperFl === 'number' ? Math.min(raw.upperFl, FL_MAX) : fallback.upperFl;
  const band = lower >= FL_MIN && lower < upper ? { lowerFl: lower, upperFl: upper } : fallback;
  return {
    ...band,
    ground: bool(raw.ground, fallback.ground),
    squawk: oneOf(SQUAWK_FILTERS, raw.squawk, fallback.squawk),
  };
}

function layersFrom(raw: unknown, fallback: Layers): Layers {
  const out = { ...fallback };
  if (isRecord(raw)) for (const k of LAYER_KEYS) out[k] = bool(raw[k], fallback[k]);
  return out;
}

const numberIn = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && v >= min && v <= max ? v : fallback;

function altimeterFrom(raw: unknown, fallback: Altimeter): Altimeter {
  if (!isRecord(raw)) return fallback;
  return {
    transitionAltFt: numberIn(
      raw.transitionAltFt,
      0,
      TRANSITION_ALT_MAX_FT,
      fallback.transitionAltFt,
    ),
    qnhInHg: numberIn(raw.qnhInHg, QNH_MIN_INHG, QNH_MAX_INHG, fallback.qnhInHg),
  };
}

function qnhFrom(raw: unknown, fallback: QnhSetting): QnhSetting {
  if (!isRecord(raw)) return fallback;
  const station = raw.station;
  return {
    auto: bool(raw.auto, fallback.auto),
    station:
      typeof station === 'string' && (station === '' || STATION_RE.test(station))
        ? station
        : fallback.station,
  };
}

function settingsFrom(raw: unknown, fallback: Settings): Settings {
  if (!isRecord(raw)) return fallback;
  return {
    rangeNm:
      typeof raw.rangeNm === 'number' && raw.rangeNm >= RANGE_MIN_NM && raw.rangeNm <= RANGE_MAX_NM
        ? raw.rangeNm
        : fallback.rangeNm,
    vectorMin: oneOf<number>(VECTOR_STEPS, raw.vectorMin, fallback.vectorMin),
    trailSec: oneOf<number>(TRAIL_STEPS, raw.trailSec, fallback.trailSec),
    filter: filterFrom(raw.filter, fallback.filter),
    layers: layersFrom(raw.layers, fallback.layers),
    labelDensity: oneOf(LABEL_DENSITIES, raw.labelDensity, fallback.labelDensity),
    altimeter: altimeterFrom(raw.altimeter, fallback.altimeter),
    qnh: qnhFrom(raw.qnh, fallback.qnh),
  };
}

function panelsFrom(raw: unknown, fallback: Panels): Panels {
  const out = { ...fallback };
  if (isRecord(raw)) for (const k of PANEL_IDS) out[k] = bool(raw[k], fallback[k]);
  return out;
}

function sortFrom(raw: unknown, fallback: ListSort): ListSort {
  if (!isRecord(raw)) return fallback;
  return {
    key: oneOf(SORT_KEYS, raw.key, fallback.key),
    dir: oneOf(SORT_DIRS, raw.dir, fallback.dir),
  };
}

/**
 * The lanes known, each once; an empty list is a choice to plot nothing. A plot saved before
 * lanes stood alone lists intents too, which are dropped; one saved before instruments were lanes
 * gets them first.
 */
function plottedFrom(
  raw: unknown,
  version: unknown,
  fallback: readonly LaneKey[],
): readonly LaneKey[] {
  if (!Array.isArray(raw)) return fallback;
  const lanes = [...new Set(raw.filter(isLaneKey))];
  return version === LANES_VERSION ? lanes : withInstruments(lanes);
}

/** Field-by-field validation: anything unexpected falls back to the default for that field. */
export function loadPersisted(storage: Storage, defaults: Persisted): Persisted {
  const raw = readJson(storage, PERSIST_KEY);
  const r = isRecord(raw) ? raw : {};
  return {
    settings: settingsFrom(r.settings, defaults.settings),
    panels: panelsFrom(r.panels, defaults.panels),
    listSort: sortFrom(r.listSort, defaults.listSort),
    plotted: plottedFrom(r.plotted, r.lanesVersion, defaults.plotted),
    lanesVersion: LANES_VERSION,
    detailTab: oneOf(DETAIL_TABS, r.detailTab, defaults.detailTab),
    ndRangeNm: oneOf(ND_RANGES_NM, r.ndRangeNm, defaults.ndRangeNm),
  };
}

/** Best effort: the scope works without storage. */
export function savePersisted(storage: Storage, state: Persisted): void {
  writeJson(storage, PERSIST_KEY, state);
}
