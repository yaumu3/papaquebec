import { isRecord } from '../lib/guards';
import { type MapSetData, validateMapSet } from '../lib/mapset';
import { readJson, writeJson } from './storageJson';

export const MAPSETS_KEY = 'papaquebec.mapsets';

export interface ImportedMapSet {
  identity: string;
  enabled: boolean;
  data: MapSetData;
}

/** Imported map sets and the enabled flags, as kept in this browser. */
export interface MapSetsPersisted {
  builtinEnabled: boolean;
  imported: ImportedMapSet[];
}

export const DEFAULT_MAPSETS: MapSetsPersisted = { builtinEnabled: true, imported: [] };

function importedFrom(raw: unknown): ImportedMapSet | null {
  if (!isRecord(raw) || typeof raw.identity !== 'string' || typeof raw.enabled !== 'boolean') {
    return null;
  }
  const data = validateMapSet(raw.data);
  return data.ok ? { identity: raw.identity, enabled: raw.enabled, data: data.data } : null;
}

/** Every stored set is validated again; one that no longer fits the schema is dropped. */
export function loadMapSets(storage: Storage): MapSetsPersisted {
  const raw = readJson(storage, MAPSETS_KEY);
  if (!isRecord(raw)) return { ...DEFAULT_MAPSETS };
  const imported = Array.isArray(raw.imported) ? raw.imported : [];
  return {
    builtinEnabled:
      typeof raw.builtinEnabled === 'boolean' ? raw.builtinEnabled : DEFAULT_MAPSETS.builtinEnabled,
    imported: imported.map(importedFrom).filter((s) => s !== null),
  };
}

/** False when the browser refused the write, typically for want of space. */
export function saveMapSets(storage: Storage, state: MapSetsPersisted): boolean {
  return writeJson(storage, MAPSETS_KEY, state);
}
