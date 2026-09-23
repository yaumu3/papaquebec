import { createStore } from 'solid-js/store';

import { DEFAULT_LIST_SORT, type ListSort } from './listSort';
import { loadPersisted, type Persisted, savePersisted } from './persist';
import {
  DEFAULT_PANELS,
  DEFAULT_SETTINGS,
  LAYER_KEYS,
  type LayerKey,
  MAP_PRESET_NAMES,
  MAP_PRESETS,
  type MapPreset,
  type Panels,
  RANGE_MAX_NM,
  RANGE_MIN_NM,
  RANGE_STEPS,
  type Settings,
} from './settingsDefaults';

export * from './settingsDefaults';

const storage = typeof localStorage === 'undefined' ? null : localStorage;

/** Settings and panel visibility as last saved in this browser, or the defaults. */
export const persisted: Persisted = storage
  ? loadPersisted(storage, DEFAULT_SETTINGS, DEFAULT_PANELS, DEFAULT_LIST_SORT)
  : {
      settings: DEFAULT_SETTINGS,
      panels: DEFAULT_PANELS,
      listSort: DEFAULT_LIST_SORT,
    };

export const [settings, setSettings] = createStore<Settings>(structuredClone(persisted.settings));

/** Writes the current settings and panel state to local storage. */
export function persist(panels: Panels, listSort: ListSort): void {
  if (!storage) return;
  const snapshot: Settings = {
    ...settings,
    filter: { ...settings.filter },
    layers: { ...settings.layers },
    altimeter: { ...settings.altimeter },
    qnh: { ...settings.qnh },
  };
  savePersisted(storage, { settings: snapshot, panels, listSort });
}

export function applyPreset(preset: MapPreset): void {
  setSettings('layers', { ...MAP_PRESETS[preset] });
}

export function toggleLayer(key: LayerKey): void {
  setSettings('layers', key, (v) => !v);
}

export function activePreset(): MapPreset | null {
  for (const name of MAP_PRESET_NAMES) {
    const layers = MAP_PRESETS[name];
    if (LAYER_KEYS.every((k) => layers[k] === settings.layers[k])) return name;
  }
  return null;
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
