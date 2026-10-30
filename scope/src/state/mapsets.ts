import type { Accessor } from 'solid-js';
import { createStore } from 'solid-js/store';

import { type Chart, chartOf, setIdentity } from '../lib/chart';
import { drawnOf } from '../lib/drawn';
import type { DrawnLayers } from '../lib/mapdata';
import { type MapSetData, validateMapSet } from '../lib/mapset';
import { BUILTIN_ID, MAPSET_VERSION } from '../lib/mapsetFormat';
import { DEFAULT_MAPSETS, loadMapSets, saveMapSets } from './mapsetsPersist';
import { versioned } from './versioned';

export interface MapSet {
  identity: string;
  data: MapSetData;
  enabled: boolean;
  builtin: boolean;
}

/** `kept` is false when the set draws this session but could not be stored for the next. */
export type ImportResult = { ok: true; kept: boolean } | { ok: false; message: string };

export interface MapSets {
  mapSets: Accessor<MapSet[]>;
  /** The enabled sets merged into items. */
  chart: Accessor<Chart>;
  /** The chart as the lists the scope draws. */
  drawn: Accessor<DrawnLayers>;
  setBuiltinMapSet: (data: MapSetData) => void;
  importMapSet: (text: string) => ImportResult;
  toggleMapSet: (identity: string) => void;
  removeMapSet: (identity: string) => void;
}

export function createMapSets(storage: Storage | null): MapSets {
  const persisted = storage ? loadMapSets(storage) : DEFAULT_MAPSETS;
  const placeholder: MapSetData = {
    type: 'FeatureCollection',
    version: MAPSET_VERSION,
    title: 'openAIP',
    features: [],
  };
  const [store, setStore] = createStore<{ sets: MapSet[] }>({
    sets: [
      { identity: BUILTIN_ID, data: placeholder, enabled: persisted.builtinEnabled, builtin: true },
      ...persisted.imported.map(({ identity, enabled, data }) => ({
        identity,
        enabled,
        data,
        builtin: false,
      })),
    ],
  });

  const chart = versioned(() => chartOf(store.sets.filter((s) => s.enabled).map((s) => s.data)));
  const drawn = versioned(() => drawnOf(chart.get()));

  /** After every change: the merge is stale, and the sets go back to storage. */
  const commit = (): boolean => {
    chart.invalidate();
    drawn.invalidate();
    if (!storage) return true;
    const builtin = store.sets.find((s) => s.builtin);
    return saveMapSets(storage, {
      builtinEnabled: builtin?.enabled ?? true,
      imported: store.sets
        .filter((s) => !s.builtin)
        .map(({ identity, enabled, data }) => ({ identity, enabled, data })),
    });
  };

  return {
    mapSets: () => store.sets,
    chart: chart.get,
    drawn: drawn.get,
    setBuiltinMapSet(data) {
      // Assigned whole, since a value set at its `data` path would merge into the placeholder.
      setStore('sets', (sets) => sets.map((set) => (set.builtin ? { ...set, data } : set)));
      commit();
    },
    importMapSet(text) {
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        return { ok: false, message: 'not JSON' };
      }
      const valid = validateMapSet(raw);
      if (!valid.ok) return valid;
      const identity = setIdentity(valid.data);
      if (identity === BUILTIN_ID) return { ok: false, message: `already built in: ${identity}` };
      const set: MapSet = { identity, data: valid.data, enabled: true, builtin: false };
      setStore('sets', (sets) => {
        const at = sets.findIndex((s) => s.identity === identity);
        return at >= 0 ? sets.with(at, set) : [...sets, set];
      });
      return { ok: true, kept: commit() };
    },
    toggleMapSet(identity) {
      setStore(
        'sets',
        (s) => s.identity === identity,
        'enabled',
        (v) => !v,
      );
      commit();
    },
    removeMapSet(identity) {
      setStore('sets', (sets) => sets.filter((s) => s.identity !== identity || s.builtin));
      commit();
    },
  };
}

/** What the Maps panel says after an import; null when there is nothing to say. */
export function importNote(result: ImportResult): string | null {
  if (!result.ok) return result.message;
  return result.kept ? null : 'imported for this session only: browser storage is full';
}

/** Removing takes two clicks on the same control: the first arms it, the second acts. */
export function armRemoval(
  armed: string | null,
  clicked: string,
): { armed: string | null; remove: string | null } {
  return armed === clicked ? { armed: null, remove: clicked } : { armed: clicked, remove: null };
}

const sets = createMapSets(typeof localStorage === 'undefined' ? null : localStorage);
export const { mapSets, chart, drawn, setBuiltinMapSet, importMapSet, toggleMapSet, removeMapSet } =
  sets;
