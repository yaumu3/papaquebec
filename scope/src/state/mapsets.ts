import { type Accessor, createSignal } from 'solid-js';

import { chartOf } from '../lib/chart';
import { isRecord } from '../lib/guards';
import { type MapSetData, setIdentity, validateMapSet } from '../lib/mapset';
import { BUILTIN_ID, MAPSET_VERSION } from '../lib/mapsetFormat';
import { type Topology, topologyOf } from '../lib/topology';
import { type MapSetStore, openMapSetStore } from './mapsetStore';
import { setSettings, settings } from './settings';
import { readJson } from './storageJson';

export interface MapSet {
  identity: string;
  data: MapSetData;
  builtin: boolean;
  /** When it was imported, in ms since the epoch; 0 for the built-in set. */
  imported: number;
}

/** `kept` settles false when the set draws this session but could not be stored for the next. */
export type ImportResult = { ok: true; kept: Promise<boolean> } | { ok: false; message: string };

export interface MapSets {
  mapSets: Accessor<MapSet[]>;
  isEnabled: (identity: string) => boolean;
  /** The enabled sets merged into a chart, with its shared edges. */
  topology: Accessor<Topology>;
  /** Settles once the stored sets are merged in, or the store proved unavailable. */
  hydrated: Promise<void>;
  setBuiltinMapSet: (data: MapSetData) => void;
  importMapSet: (text: string) => ImportResult;
  toggleMapSet: (identity: string) => void;
  removeMapSet: (identity: string) => void;
}

/**
 * The last result of `compute`, kept while `inputs` gives the same references in order: a memo
 * that also holds under `bun test`, where `createMemo` never runs again, and that no change to
 * the inputs can forget to renew.
 */
function byReference<I, T>(inputs: () => readonly I[], compute: (inputs: readonly I[]) => T) {
  let cached: { inputs: readonly I[]; value: T } | null = null;
  return (): T => {
    const now = inputs();
    const known = cached?.inputs;
    if (cached && known?.length === now.length && now.every((input, i) => input === known[i])) {
      return cached.value;
    }
    cached = { inputs: now, value: compute(now) };
    return cached.value;
  };
}

/** A stored record as a set, if it is one: its data passes the strict parse. */
function setFrom(record: unknown): MapSet | null {
  if (!isRecord(record) || typeof record.identity !== 'string') return null;
  const { identity, imported } = record;
  if (typeof imported !== 'number') return null;
  const valid = validateMapSet(record.data);
  return valid.ok ? { identity, data: valid.data, builtin: false, imported } : null;
}

/** Where an earlier version kept the built-in set's flag; the imported sets' were on their records. */
const OLD_FLAG_KEY = 'papaquebec.mapsets';

/** Which of the stored records an earlier version had switched off. */
const offInRecords = (records: readonly unknown[]): string[] =>
  records.flatMap((record) =>
    isRecord(record) && record.enabled === false && typeof record.identity === 'string'
      ? [record.identity]
      : [],
  );

/** The built-in set last, the imports newest first; a stable sort keeps ties as they were. */
const byPrecedence = (sets: readonly MapSet[]): MapSet[] =>
  sets.toSorted((a, b) => Number(a.builtin) - Number(b.builtin) || b.imported - a.imported);

/** The list of sets switched off, held by the settings. */
export interface SetFlags {
  disabled: () => readonly string[];
  setDisabled: (identities: readonly string[]) => void;
}

export function createMapSets(
  flags: SetFlags,
  storage: Storage | null,
  opening: Promise<MapSetStore>,
  now: () => number = Date.now,
  afterDraw: () => Promise<void> = () => Promise.resolve(),
  nextTask: (task: () => void) => void = (task) => task(),
): MapSets {
  const placeholder: MapSetData = {
    type: 'FeatureCollection',
    version: MAPSET_VERSION,
    title: 'openAIP',
    features: [],
  };
  // A signal, not a store: a store would wrap and walk every coordinate of a set.
  const [sets, setSets] = createSignal<MapSet[]>([
    {
      identity: BUILTIN_ID,
      data: placeholder,
      builtin: true,
      imported: 0,
    },
  ]);

  const isEnabled = (identity: string) => !flags.disabled().includes(identity);
  /** Takes a set off the list; a set not on it changes nothing, so no reader runs again. */
  const enable = (identity: string) => {
    if (isEnabled(identity)) return;
    flags.setDisabled(flags.disabled().filter((id) => id !== identity));
  };
  const adoptOff = (identities: readonly string[]) =>
    flags.setDisabled([...new Set([...flags.disabled(), ...identities])]);

  const topology = byReference(
    () =>
      sets()
        .filter((s) => isEnabled(s.identity))
        .map((s) => s.data),
    (data) => topologyOf(chartOf(data)),
  );

  /** What every write waits for: writing clones a whole set, which would hold up its first draw. */
  let drawing = Promise.resolve();
  /** Runs a write on the store once it is open; false when it cannot be opened or refuses. */
  const stored = (write: (open: MapSetStore) => Promise<void>): Promise<boolean> =>
    Promise.all([opening, drawing])
      .then(([open]) => write(open))
      .then(
        () => true,
        () => false,
      );
  const oldFlag = storage && readJson(storage, OLD_FLAG_KEY);
  if (isRecord(oldFlag) && oldFlag.builtinEnabled === false) adoptOff([BUILTIN_ID]);

  const hydrated = opening
    .then((open) => open.all())
    .then((records) => {
      if (oldFlag) adoptOff(offInRecords(records));
      const loaded = records.map(setFrom).filter((s) => s !== null);
      setSets((own) =>
        byPrecedence([
          ...own,
          ...loaded.filter((s) => !own.some(({ identity }) => identity === s.identity)),
        ]),
      );
    })
    .catch(() => {})
    .then(() => storage?.removeItem(OLD_FLAG_KEY));

  return {
    mapSets: sets,
    isEnabled,
    topology,
    hydrated,
    setBuiltinMapSet(data) {
      setSets((own) => own.map((set) => (set.builtin ? { ...set, data } : set)));
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
      const { data } = valid;
      const imported = now();
      const set: MapSet = { identity, data, builtin: false, imported };
      // The chart builds in a task of its own, so the parse does not add to the page's longest.
      const kept = new Promise<boolean>((settle) => {
        nextTask(() => {
          setSets((own) => [set, ...own.filter((s) => s.identity !== identity)]);
          enable(identity);
          drawing = afterDraw();
          settle(stored((open) => open.put({ identity, imported, data })));
        });
      });
      return { ok: true, kept };
    },
    toggleMapSet(identity) {
      if (isEnabled(identity)) flags.setDisabled([...flags.disabled(), identity]);
      else enable(identity);
    },
    removeMapSet(identity) {
      if (sets().some((s) => s.identity === identity && !s.builtin)) {
        void stored((open) => open.delete(identity));
      }
      setSets((own) => own.filter((s) => s.identity !== identity || s.builtin));
      enable(identity);
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

/** How long a hidden page, which draws no frames, waits instead, in ms. */
const NO_FRAME_MS = 250;

/** Resolves once the next frame is out of the way. */
const afterFrame = () =>
  new Promise<void>((done) => {
    const timer = setTimeout(done, NO_FRAME_MS);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      setTimeout(done);
    });
  });

const mapsets = createMapSets(
  {
    disabled: () => settings.disabledSets,
    setDisabled: (identities) => setSettings('disabledSets', [...identities]),
  },
  typeof localStorage === 'undefined' ? null : localStorage,
  openMapSetStore(globalThis.indexedDB),
  Date.now,
  afterFrame,
  (task) => setTimeout(task),
);
export const {
  mapSets,
  isEnabled: isSetEnabled,
  topology,
  setBuiltinMapSet,
  importMapSet,
  toggleMapSet,
  removeMapSet,
} = mapsets;
