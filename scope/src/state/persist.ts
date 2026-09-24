import type { Altimeter } from '../lib/altitude';
import { isRecord } from '../lib/guards';
import { type Filter, FL_MAX, FL_MIN, type SquawkFilter } from './filter';
import { type ListSort, SORT_DIRS, SORT_KEYS } from './listSort';
import {
  LABEL_DENSITIES,
  LAYER_KEYS,
  type Layers,
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

export interface Persisted {
  settings: Settings;
  panels: Panels;
  listSort: ListSort;
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

/** Field-by-field validation: anything unexpected falls back to the default for that field. */
export function loadPersisted(
  storage: Storage,
  settings: Settings,
  panels: Panels,
  listSort: ListSort,
): Persisted {
  const raw = readJson(storage, PERSIST_KEY);
  const r = isRecord(raw) ? raw : {};
  return {
    settings: settingsFrom(r.settings, settings),
    panels: panelsFrom(r.panels, panels),
    listSort: sortFrom(r.listSort, listSort),
  };
}

/** Best effort: the scope works without storage. */
export function savePersisted(storage: Storage, state: Persisted): void {
  writeJson(storage, PERSIST_KEY, state);
}
