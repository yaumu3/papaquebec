import { isRecord } from '../lib/guards';
import { type AeroData, validateAero } from '../lib/mapdata';

export const MAPSETS_KEY = 'papaquebec.mapsets';

export interface ImportedMapSet {
  id: string;
  enabled: boolean;
  data: AeroData;
}

/** Imported map sets and the enabled flags, as kept in this browser. */
export interface MapSetsPersisted {
  builtinEnabled: boolean;
  imported: ImportedMapSet[];
}

export const DEFAULT_MAPSETS: MapSetsPersisted = { builtinEnabled: true, imported: [] };

function importedFrom(raw: unknown): ImportedMapSet | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.enabled !== 'boolean') return null;
  const data = validateAero(raw.data);
  return data.ok ? { id: raw.id, enabled: raw.enabled, data: data.data } : null;
}

/** Every stored set is validated again; one that no longer fits the schema is dropped. */
export function loadMapSets(storage: Storage): MapSetsPersisted {
  let raw: unknown = null;
  try {
    const text = storage.getItem(MAPSETS_KEY);
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = null;
  }
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
  try {
    storage.setItem(MAPSETS_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
