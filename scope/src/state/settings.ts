import { createStore, unwrap } from 'solid-js/store';

import { isRecord } from '../lib/guards';
import { loadPersisted, type Persisted, savePersisted } from './persist';
import { DEFAULT_PLOTTED } from './plotted';
import {
  DEFAULT_ND_RANGE_NM,
  DEFAULT_LIST_SORT,
  DEFAULT_PANELS,
  DEFAULT_SETTINGS,
  RANGE_MAX_NM,
  RANGE_MIN_NM,
  RANGE_STEPS,
  type Settings,
} from './settingsDefaults';

export * from './settingsDefaults';

const storage = typeof localStorage === 'undefined' ? null : localStorage;

const DEFAULTS: Persisted = {
  settings: DEFAULT_SETTINGS,
  panels: DEFAULT_PANELS,
  listSort: DEFAULT_LIST_SORT,
  plotted: DEFAULT_PLOTTED,
  ndRangeNm: DEFAULT_ND_RANGE_NM,
};

/** Settings and panel visibility as last saved in this browser, or the defaults. */
export const persisted: Persisted = storage ? loadPersisted(storage, DEFAULTS) : DEFAULTS;

export const [settings, setSettings] = createStore<Settings>(structuredClone(persisted.settings));

/** Reads every field of a store, so that an effect calling this follows them all. */
function readThrough(value: unknown): void {
  if (Array.isArray(value)) value.forEach(readThrough);
  else if (isRecord(value)) Object.values(value).forEach(readThrough);
}

/**
 * Writes the current settings and the rest of the persisted state to local storage. An effect
 * calling this runs again on any change to the settings: `unwrap` alone would track none.
 */
export function persist(rest: Omit<Persisted, 'settings'>): void {
  if (!storage) return;
  readThrough(settings);
  savePersisted(storage, { settings: structuredClone(unwrap(settings)), ...rest });
}

/** Jump to the next preset above or below the current range. */
export function stepRange(direction: 1 | -1): void {
  const current = settings.rangeNm;
  const next =
    direction > 0
      ? RANGE_STEPS.find((r) => r > current)
      : RANGE_STEPS.toReversed().find((r) => r < current);
  if (next !== undefined) setSettings('rangeNm', next);
}

export function setRange(rangeNm: number): void {
  setSettings('rangeNm', Math.max(RANGE_MIN_NM, Math.min(RANGE_MAX_NM, rangeNm)));
}

export function cycle(steps: readonly number[], current: number): number {
  const i = steps.indexOf(current);
  return steps[(i + 1) % steps.length] ?? 0;
}
