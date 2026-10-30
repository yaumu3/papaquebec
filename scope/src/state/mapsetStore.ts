import type { MapSetData } from '../lib/mapset';

/** One imported map set as kept in the browser: its identity is the key. */
export interface StoredMapSet {
  identity: string;
  enabled: boolean;
  data: MapSetData;
}

/** Imported sets, one record each, written and deleted one at a time. */
export interface MapSetStore {
  /** Every record, in identity order. */
  all: () => Promise<StoredMapSet[]>;
  put: (set: StoredMapSet) => Promise<void>;
  delete: (identity: string) => Promise<void>;
}

const DATABASE = 'papaquebec';
const STORE = 'mapsets';
const VERSION = 1;

const result = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });

const completed = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.addEventListener('complete', () => resolve());
    tx.addEventListener('error', () => reject(tx.error));
    tx.addEventListener('abort', () => reject(tx.error));
  });

function storeOver(db: IDBDatabase): MapSetStore {
  const write = (act: (store: IDBObjectStore) => void): Promise<void> => {
    const tx = db.transaction(STORE, 'readwrite');
    act(tx.objectStore(STORE));
    return completed(tx);
  };
  return {
    all: () => result<StoredMapSet[]>(db.transaction(STORE).objectStore(STORE).getAll()),
    put: (set) => write((store) => void store.put(set)),
    delete: (identity) => write((store) => void store.delete(identity)),
  };
}

/** Rejects where there is no IndexedDB, or opening it throws, as in some private windows. */
export function openMapSetStore(factory: IDBFactory | undefined): Promise<MapSetStore> {
  return new Promise((resolve, reject) => {
    if (!factory) {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    try {
      const opening = factory.open(DATABASE, VERSION);
      opening.addEventListener('upgradeneeded', () => {
        opening.result.createObjectStore(STORE, { keyPath: 'identity' });
      });
      opening.addEventListener('success', () => resolve(storeOver(opening.result)));
      opening.addEventListener('error', () => reject(opening.error));
    } catch (error) {
      reject(error);
    }
  });
}
