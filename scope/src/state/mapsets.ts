import { type Accessor, createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';

import {
  type AeroData,
  type AeroLayers,
  EMPTY_AERO,
  mergeAero,
  validateAero,
} from '../lib/mapdata';
import { DEFAULT_MAPSETS, loadMapSets, saveMapSets } from './mapsetsPersist';

/** The set generated around the site at container start; a preset that cannot be removed. */
export const BUILTIN_ID = 'openaip';

export interface MapSet {
  id: string;
  data: AeroData;
  enabled: boolean;
  builtin: boolean;
}

/** `kept` is false when the set draws this session but could not be stored for the next. */
export type ImportResult = { ok: true; kept: boolean } | { ok: false; message: string };

export interface MapSets {
  mapSets: Accessor<MapSet[]>;
  /** The enabled sets merged; what the scope draws. */
  aero: Accessor<AeroLayers>;
  setBuiltinAero: (data: AeroData) => void;
  importMapSet: (text: string, id?: string) => ImportResult;
  toggleMapSet: (id: string) => void;
  removeMapSet: (id: string) => void;
}

/** A set id: a UUID where the page is a secure context, else time and chance. */
export function freshId(source: { randomUUID?: () => string } = crypto): string {
  return (
    source.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

export function createMapSets(storage: Storage | null): MapSets {
  const persisted = storage ? loadMapSets(storage) : DEFAULT_MAPSETS;
  const placeholder: AeroData = { ...EMPTY_AERO, title: 'openAIP' };
  const [store, setStore] = createStore<{ sets: MapSet[] }>({
    sets: [
      { id: BUILTIN_ID, data: placeholder, enabled: persisted.builtinEnabled, builtin: true },
      ...persisted.imported.map(({ id, enabled, data }) => ({ id, enabled, data, builtin: false })),
    ],
  });

  const save = (): boolean => {
    if (!storage) return true;
    const builtin = store.sets.find((s) => s.builtin);
    return saveMapSets(storage, {
      builtinEnabled: builtin?.enabled ?? true,
      imported: store.sets
        .filter((s) => !s.builtin)
        .map(({ id, enabled, data }) => ({ id, enabled, data })),
    });
  };

  // Merged once per change and tracked through the version, so a pointer move does not merge.
  const [version, setVersion] = createSignal(0);
  let merged: { version: number; data: AeroLayers } | null = null;
  const aero = (): AeroLayers => {
    const v = version();
    if (merged?.version !== v) {
      merged = {
        version: v,
        data: mergeAero(store.sets.filter((s) => s.enabled).map((s) => s.data)),
      };
    }
    return merged.data;
  };
  const changed = (): void => {
    setVersion((v) => v + 1);
  };

  return {
    mapSets: () => store.sets,
    aero,
    setBuiltinAero(data) {
      // Assigned whole: a value set at the `data` path would merge into the placeholder.
      setStore(
        'sets',
        (s) => s.builtin,
        (set) => ({ ...set, data }),
      );
      changed();
    },
    importMapSet(text, id = freshId()) {
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        return { ok: false, message: 'not JSON' };
      }
      const valid = validateAero(raw);
      if (!valid.ok) return valid;
      const set: MapSet = { id, data: valid.data, enabled: true, builtin: false };
      setStore('sets', (sets) => {
        const at = sets.findIndex((s) => !s.builtin && s.data.title === set.data.title);
        return at >= 0 ? sets.with(at, set) : [...sets, set];
      });
      changed();
      return { ok: true, kept: save() };
    },
    toggleMapSet(id) {
      setStore(
        'sets',
        (s) => s.id === id,
        'enabled',
        (v) => !v,
      );
      changed();
      save();
    },
    removeMapSet(id) {
      setStore('sets', (sets) => sets.filter((s) => s.id !== id || s.builtin));
      changed();
      save();
    },
  };
}

const sets = createMapSets(typeof localStorage === 'undefined' ? null : localStorage);
export const { mapSets, aero, setBuiltinAero, importMapSet, toggleMapSet, removeMapSet } = sets;

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
