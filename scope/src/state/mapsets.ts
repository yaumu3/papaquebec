import type { Accessor } from 'solid-js';
import { createStore, unwrap } from 'solid-js/store';

import { chartOf } from '../lib/chart';
import { isRecord } from '../lib/guards';
import { type MapSetData, setIdentity, validateMapSet } from '../lib/mapset';
import { BUILTIN_ID, MAPSET_VERSION } from '../lib/mapsetFormat';
import { type Topology, topologyOf } from '../lib/topology';
import { DEFAULT_MAPSETS, loadMapSets, saveMapSets } from './mapsetsPersist';
import { type MapSetStore, openMapSetStore, type StoredMapSet } from './mapsetStore';
import { versioned } from './versioned';

export interface MapSet {
  identity: string;
  data: MapSetData;
  enabled: boolean;
  builtin: boolean;
  /** When it was imported, in ms since the epoch; 0 for the built-in set and for a set stored before imports were timed. */
  imported: number;
}

/** `kept` settles false when the set draws this session but could not be stored for the next. */
export type ImportResult = { ok: true; kept: Promise<boolean> } | { ok: false; message: string };

export interface MapSets {
  mapSets: Accessor<MapSet[]>;
  /** The enabled sets merged into a chart, with its shared edges. */
  topology: Accessor<Topology>;
  /** Settles once the stored sets are merged in, or the store proved unavailable. */
  hydrated: Promise<void>;
  setBuiltinMapSet: (data: MapSetData) => void;
  importMapSet: (text: string) => ImportResult;
  toggleMapSet: (identity: string) => void;
  removeMapSet: (identity: string) => void;
}

/** A stored record as a set, if it is one: its data passes the strict parse. */
function setFrom(record: unknown): MapSet | null {
  if (!isRecord(record) || typeof record.identity !== 'string') return null;
  if (typeof record.enabled !== 'boolean') return null;
  const valid = validateMapSet(record.data);
  const { identity, enabled } = record;
  const imported = typeof record.imported === 'number' ? record.imported : 0;
  return valid.ok ? { identity, data: valid.data, enabled, builtin: false, imported } : null;
}

/** The built-in set last, the imports newest first; a stable sort keeps ties as they were. */
const byPrecedence = (sets: readonly MapSet[]): MapSet[] =>
  sets.toSorted((a, b) => Number(a.builtin) - Number(b.builtin) || b.imported - a.imported);

export function createMapSets(
  storage: Storage | null,
  opening: Promise<MapSetStore>,
  now: () => number = Date.now,
): MapSets {
  const persisted = storage ? loadMapSets(storage) : DEFAULT_MAPSETS;
  const placeholder: MapSetData = {
    type: 'FeatureCollection',
    version: MAPSET_VERSION,
    title: 'openAIP',
    features: [],
  };
  const [store, setStore] = createStore<{ sets: MapSet[] }>({
    sets: [
      {
        identity: BUILTIN_ID,
        data: placeholder,
        enabled: persisted.builtinEnabled,
        builtin: true,
        imported: 0,
      },
    ],
  });

  /** Read as plain data: a rebuild through store proxies tracks every coordinate. */
  const topology = versioned(() =>
    topologyOf(chartOf(store.sets.filter((s) => s.enabled).map((s) => unwrap(s.data)))),
  );

  /** After a change to the sets: the merge is stale, and the built-in flag goes to storage. */
  const commit = () => {
    topology.invalidate();
    const builtin = store.sets.find((s) => s.builtin);
    if (storage) saveMapSets(storage, { builtinEnabled: builtin?.enabled ?? true });
  };

  /** Runs a write on the store once it is open; false when it cannot be opened or refuses. */
  const stored = (write: (open: MapSetStore) => Promise<void>): Promise<boolean> =>
    opening.then(write).then(
      () => true,
      () => false,
    );
  /** The record for the store: IndexedDB clones what it is given, and a store proxy cannot be cloned. */
  const recordOf = (identity: string): StoredMapSet | undefined => {
    const set = store.sets.find((s) => s.identity === identity);
    return set && !set.builtin
      ? { identity, enabled: set.enabled, imported: set.imported, data: unwrap(set.data) }
      : undefined;
  };
  const rewrite = (identity: string) => {
    const record = recordOf(identity);
    return record ? stored((open) => open.put(record)) : Promise.resolve(true);
  };

  const hydrated = opening
    .then((open) => open.all())
    .then((records) => {
      const loaded = records.map(setFrom).filter((s) => s !== null);
      setStore('sets', (sets) =>
        byPrecedence([
          ...sets,
          ...loaded.filter((s) => !sets.some((own) => own.identity === s.identity)),
        ]),
      );
      topology.invalidate();
    })
    .catch(() => {});

  return {
    mapSets: () => store.sets,
    topology: topology.get,
    hydrated,
    setBuiltinMapSet(data) {
      // Assigned whole, since a value set at its `data` path would merge into the placeholder.
      setStore('sets', (sets) => sets.map((set) => (set.builtin ? { ...set, data } : set)));
      topology.invalidate();
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
      const set: MapSet = {
        identity,
        data: valid.data,
        enabled: true,
        builtin: false,
        imported: now(),
      };
      setStore('sets', (sets) => [set, ...sets.filter((s) => s.identity !== identity)]);
      commit();
      return { ok: true, kept: rewrite(identity) };
    },
    toggleMapSet(identity) {
      setStore(
        'sets',
        (s) => s.identity === identity,
        'enabled',
        (v) => !v,
      );
      commit();
      void rewrite(identity);
    },
    removeMapSet(identity) {
      if (store.sets.some((s) => s.identity === identity && !s.builtin)) {
        void stored((open) => open.delete(identity));
      }
      setStore('sets', (sets) => sets.filter((s) => s.identity !== identity || s.builtin));
      topology.invalidate();
    },
  };
}

/** What the Maps panel says after an import; null when there is nothing to say. */
export async function importNote(result: ImportResult): Promise<string | null> {
  if (!result.ok) return result.message;
  return (await result.kept) ? null : 'imported for this session only: browser storage is full';
}

/** Removing takes two clicks on the same control: the first arms it, the second acts. */
export function armRemoval(
  armed: string | null,
  clicked: string,
): { armed: string | null; remove: string | null } {
  return armed === clicked ? { armed: null, remove: clicked } : { armed: clicked, remove: null };
}

const sets = createMapSets(
  typeof localStorage === 'undefined' ? null : localStorage,
  openMapSetStore(globalThis.indexedDB),
);
export const { mapSets, topology, setBuiltinMapSet, importMapSet, toggleMapSet, removeMapSet } =
  sets;
