import { isRecord } from '../lib/guards';
import { readJson, writeJson } from './storageJson';

export const MAPSETS_KEY = 'papaquebec.mapsets';

/** What of the map sets the browser keeps in its storage: the built-in set's enabled flag. */
export interface MapSetsPersisted {
  builtinEnabled: boolean;
}

export const DEFAULT_MAPSETS: MapSetsPersisted = { builtinEnabled: true };

export function loadMapSets(storage: Storage): MapSetsPersisted {
  const raw = readJson(storage, MAPSETS_KEY);
  if (!isRecord(raw)) return { ...DEFAULT_MAPSETS };
  return {
    builtinEnabled:
      typeof raw.builtinEnabled === 'boolean' ? raw.builtinEnabled : DEFAULT_MAPSETS.builtinEnabled,
  };
}

/** Best effort: the scope works without storage. */
export function saveMapSets(storage: Storage, state: MapSetsPersisted): void {
  writeJson(storage, MAPSETS_KEY, state);
}
