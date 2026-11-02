import { describe, expect, it } from 'bun:test';

import { validateMapSet } from '../lib/mapset';
import { BUILTIN_ID } from '../lib/mapsetFormat';
import { armRemoval, createMapSets, importNote } from './mapsets';
import type { MapSetStore, StoredMapSet } from './mapsetStore';
import { memoryStorage } from './memoryStorage';

const setOf = (title: string, features: object[], id?: string) => ({
  type: 'FeatureCollection',
  version: 2,
  ...(id ? { id } : {}),
  title,
  features,
});
const pointAt = (layer: string, id: string) => ({
  type: 'Feature',
  properties: { layer, id },
  geometry: { type: 'Point', coordinates: [130.9, 33.9] },
});

const fixes = setOf('My fixes', [pointAt('fix', 'TAVRO')], 'my-fixes');
const more = setOf('More fixes', [pointAt('navaid', 'QDG')], 'more-fixes');
const builtIn = setOf('openAIP XX', [pointAt('fix', 'NIMBA')], BUILTIN_ID);

const parsed = (document: object) => {
  const verdict = validateMapSet(document);
  if (!verdict.ok) throw new Error(verdict.message);
  return verdict.data;
};
const stored = (document: object, imported = 0): StoredMapSet => {
  const data = parsed(document);
  return { identity: data.id ?? data.title, imported, data };
};
/** A record as an earlier version wrote it, with its flag in it. */
const flagged = (document: object, enabled: boolean, imported = 0): StoredMapSet =>
  JSON.parse(JSON.stringify({ ...stored(document, imported), enabled }));
/** Where an earlier version kept the built-in set's flag. */
const OLD_KEY = 'papaquebec.mapsets';
/** A clock that reads 101, 102 ... so each import is later than the last, and than any record. */
const ticking = () => {
  let now = 100;
  return () => ++now;
};

/** A store over a map that logs each write, and can be told to refuse them. */
function spyStore(initial: StoredMapSet[] = [], refusing = false) {
  const records = new Map(initial.map((s) => [s.identity, s]));
  const writes: string[] = [];
  const store: MapSetStore = {
    all: () =>
      Promise.resolve(
        [...records.values()].toSorted((a, b) => a.identity.localeCompare(b.identity)),
      ),
    put(set) {
      writes.push(`put ${set.identity}`);
      if (refusing) return Promise.reject(new Error('refused'));
      records.set(set.identity, set);
      return Promise.resolve();
    },
    delete(identity) {
      writes.push(`delete ${identity}`);
      records.delete(identity);
      return Promise.resolve();
    },
  };
  return { store, records, writes };
}

/** The list of disabled sets, as the settings hold it. */
function flagsOf(initial: readonly string[] = []) {
  let list = initial;
  return {
    disabled: () => list,
    setDisabled(next: readonly string[]) {
      list = next;
    },
  };
}

const created = (spy = spyStore(), storage = memoryStorage(), flags = flagsOf()) => ({
  ...spy,
  storage,
  flags,
  sets: createMapSets(flags, storage, Promise.resolve(spy.store), ticking()),
});
/** The ids of the points the chart holds on a layer. */
const idsOf = (sets: ReturnType<typeof createMapSets>, layer: string) =>
  sets
    .topology()
    .chart.filter((item) => item.layer === layer)
    .flatMap((item) => item.parts.map((p) => ('id' in p.properties ? p.properties.id : '')));
const importing = (sets: ReturnType<typeof createMapSets>, document: object) =>
  sets.importMapSet(JSON.stringify(document));

describe('createMapSets', () => {
  it('starts with the built-in set alone, drawing nothing until its data arrives', () => {
    // Arrange
    const { sets } = created();

    // Act
    const [list, chart] = [sets.mapSets(), sets.topology().chart];

    // Assert
    expect(list.map((s) => [s.identity, s.builtin])).toEqual([[BUILTIN_ID, true]]);
    expect(sets.isEnabled(BUILTIN_ID)).toBe(true);
    expect(chart).toEqual([]);
  });

  it('leaves out of the chart a set the list of disabled sets names', () => {
    // Arrange
    const flags = flagsOf([BUILTIN_ID]);
    const { sets } = created(spyStore(), memoryStorage(), flags);

    // Act
    sets.setBuiltinMapSet(parsed(builtIn));

    // Assert
    expect(sets.isEnabled(BUILTIN_ID)).toBe(false);
    expect(idsOf(sets, 'fix')).toEqual([]);
  });

  it('draws the built-in set once it arrives', () => {
    // Arrange
    const { sets } = created();
    const data = parsed(builtIn);

    // Act
    sets.setBuiltinMapSet(data);

    // Assert
    expect(sets.mapSets()[0]?.data.title).toBe('openAIP XX');
    expect(idsOf(sets, 'fix')).toEqual(['NIMBA']);
  });

  it('adds a valid import, enabled and stored under its identity', async () => {
    // Arrange
    const { sets, records } = created();

    // Act
    const out = importing(sets, fixes);
    const kept = out.ok ? await out.kept : null;

    // Assert
    expect(kept).toBe(true);
    expect(sets.mapSets().map((s) => s.identity)).toEqual(['my-fixes', BUILTIN_ID]);
    expect(idsOf(sets, 'fix')).toEqual(['TAVRO']);
    expect([...records.keys()]).toEqual(['my-fixes']);
  });

  it('identifies a set without an id by its title', () => {
    // Arrange
    const { sets } = created();

    // Act
    importing(sets, setOf('Untagged', []));

    // Assert
    expect(sets.mapSets().map((s) => s.identity)).toEqual(['Untagged', BUILTIN_ID]);
  });

  it('refuses a set whose identity is the built-in one', () => {
    // Arrange
    const { sets, writes } = created();
    const documents = [setOf('Any title', [], BUILTIN_ID), setOf(BUILTIN_ID, [])];

    // Act
    const out = documents.map((document) => importing(sets, document));

    // Assert
    expect(out).toEqual(documents.map(() => ({ ok: false, message: 'already built in: openaip' })));
    expect([sets.mapSets().length, writes]).toEqual([1, []]);
  });

  it('moves a re-imported set to the front of the imports, replacing it', () => {
    // Arrange
    const { sets } = created();
    importing(sets, fixes);
    importing(sets, more);

    // Act
    importing(sets, setOf('My fixes, revised', [], 'my-fixes'));

    // Assert
    expect(sets.mapSets().map((s) => [s.identity, s.data.title])).toEqual([
      ['my-fixes', 'My fixes, revised'],
      ['more-fixes', 'More fixes'],
      [BUILTIN_ID, 'openAIP'],
    ]);
    expect(idsOf(sets, 'fix')).toEqual([]);
  });

  it('rejects text that is not JSON or not a map set, changing nothing', () => {
    // Arrange
    const { sets, writes } = created();

    // Act
    const out = [sets.importMapSet('{oops'), sets.importMapSet('{"waypoints":[]}')];

    // Assert
    expect(out[0]).toEqual({ ok: false, message: 'not JSON' });
    expect(out[1]).toEqual({ ok: false, message: expect.stringContaining('type') });
    expect([sets.mapSets().length, writes]).toEqual([1, []]);
  });

  it('draws the enabled sets alone', () => {
    // Arrange
    const { sets } = created();
    importing(sets, fixes);
    importing(sets, more);

    // Act
    for (const identity of ['my-fixes', BUILTIN_ID]) sets.toggleMapSet(identity);

    // Assert
    expect(idsOf(sets, 'fix')).toEqual([]);
    expect(idsOf(sets, 'navaid')).toEqual(['QDG']);
    expect(sets.topology().chart.map((item) => item.layer)).toEqual(['navaid']);
  });

  it('removes an imported set but never the built-in one', () => {
    // Arrange
    const { sets } = created();
    importing(sets, fixes);

    // Act
    for (const identity of ['my-fixes', BUILTIN_ID]) sets.removeMapSet(identity);

    // Assert
    expect(sets.mapSets().map((s) => s.identity)).toEqual([BUILTIN_ID]);
  });
});

describe('storage of imported sets', () => {
  it('writes no record to toggle a set, only the list of disabled sets', async () => {
    // Arrange
    const { sets, writes, flags } = created();
    importing(sets, fixes);

    // Act
    sets.toggleMapSet('my-fixes');
    await sets.hydrated;

    // Assert
    expect(writes).toEqual(['put my-fixes']);
    expect(flags.disabled()).toEqual(['my-fixes']);
  });

  it('writes a record without a flag', async () => {
    // Arrange
    const { sets, records } = created();

    // Act
    importing(sets, fixes);
    await sets.hydrated;

    // Assert
    expect(Object.keys(records.get('my-fixes') ?? {}).toSorted()).toEqual([
      'data',
      'identity',
      'imported',
    ]);
  });

  it('leaves the list of disabled sets alone when importing or removing a set not on it', () => {
    // Arrange
    const flags = flagsOf();
    const { sets } = created(spyStore(), memoryStorage(), flags);
    const before = flags.disabled();

    // Act
    importing(sets, fixes);
    sets.removeMapSet('my-fixes');

    // Assert
    expect(flags.disabled()).toBe(before);
  });

  it('forgets a removed set, so importing it again brings it back enabled', () => {
    // Arrange
    const { sets, flags } = created();
    importing(sets, fixes);
    sets.toggleMapSet('my-fixes');

    // Act
    sets.removeMapSet('my-fixes');
    const listed = flags.disabled();
    importing(sets, fixes);

    // Assert
    expect(listed).toEqual([]);
    expect(sets.isEnabled('my-fixes')).toBe(true);
  });

  it('writes an import only once the chart has drawn', async () => {
    // Arrange
    const spy = spyStore();
    let drawn = () => {};
    const afterDraw = () =>
      new Promise<void>((resolve) => {
        drawn = resolve;
      });
    const sets = createMapSets(
      flagsOf(),
      memoryStorage(),
      Promise.resolve(spy.store),
      ticking(),
      afterDraw,
    );
    await sets.hydrated;
    const out = importing(sets, fixes);
    await sets.hydrated;
    const before = [...spy.writes];

    // Act
    drawn();
    const kept = out.ok ? await out.kept : null;

    // Assert
    expect(before).toEqual([]);
    expect(kept).toBe(true);
    expect(spy.writes).toEqual(['put my-fixes']);
  });

  it('adds an import in the task the pacing gives it, after the parse', async () => {
    // Arrange
    const spy = spyStore();
    const tasks: (() => void)[] = [];
    const sets = createMapSets(
      flagsOf(),
      memoryStorage(),
      Promise.resolve(spy.store),
      ticking(),
      () => Promise.resolve(),
      (task) => tasks.push(task),
    );
    const out = importing(sets, fixes);
    const before = sets.mapSets().map((s) => s.identity);

    // Act
    tasks.forEach((task) => task());
    const kept = out.ok ? await out.kept : null;

    // Assert
    expect(before).toEqual([BUILTIN_ID]);
    expect(sets.mapSets().map((s) => s.identity)).toEqual(['my-fixes', BUILTIN_ID]);
    expect(kept).toBe(true);
  });

  it('removes a set imported a moment ago from the store as well', async () => {
    // Arrange
    const spy = spyStore();
    let drawn = () => {};
    const afterDraw = () =>
      new Promise<void>((resolve) => {
        drawn = resolve;
      });
    const sets = createMapSets(
      flagsOf(),
      memoryStorage(),
      Promise.resolve(spy.store),
      ticking(),
      afterDraw,
    );
    const out = importing(sets, fixes);

    // Act
    sets.removeMapSet('my-fixes');
    drawn();
    if (out.ok) await out.kept;
    await Bun.sleep(0);

    // Assert
    expect(spy.writes).toEqual(['put my-fixes', 'delete my-fixes']);
    expect([...spy.records.keys()]).toEqual([]);
  });

  it('deletes the one record to remove a set', async () => {
    // Arrange
    const { sets, writes, records } = created();
    importing(sets, fixes);
    importing(sets, more);

    // Act
    sets.removeMapSet('more-fixes');
    await sets.hydrated;

    // Assert
    expect(writes).toEqual(['put my-fixes', 'put more-fixes', 'delete more-fixes']);
    expect([...records.keys()]).toEqual(['my-fixes']);
  });

  it('merges the stored sets newest import first, the built-in set last, once hydrated', async () => {
    // Arrange
    const { sets } = created(spyStore([stored(more, 10), stored(fixes, 20)]));

    // Act
    await sets.hydrated;

    // Assert
    expect(sets.mapSets().map((s) => s.identity)).toEqual(['my-fixes', 'more-fixes', BUILTIN_ID]);
    expect(idsOf(sets, 'navaid')).toEqual(['QDG']);
  });

  it('keeps an import made before hydration finishes, ahead of the stored ones', async () => {
    // Arrange
    const { sets } = created(
      spyStore([stored(more, 10), stored(setOf('Old', [], 'my-fixes'), 20)]),
    );
    importing(sets, fixes);

    // Act
    await sets.hydrated;

    // Assert
    expect(sets.mapSets().map((s) => [s.identity, s.data.title])).toEqual([
      ['my-fixes', 'My fixes'],
      ['more-fixes', 'More fixes'],
      [BUILTIN_ID, 'openAIP'],
    ]);
  });

  it('skips a stored record that no longer passes the strict parse, or has no time', async () => {
    // Arrange
    const broken: StoredMapSet = JSON.parse('{"identity":"broken","data":{"title":"no type"}}');
    const { imported: _, ...untimed } = stored(more);
    const { sets } = created(
      spyStore([broken, JSON.parse(JSON.stringify(untimed)), stored(fixes)]),
    );

    // Act
    await sets.hydrated;

    // Assert
    expect(sets.mapSets().map((s) => s.identity)).toEqual(['my-fixes', BUILTIN_ID]);
  });

  it('draws an import for the session when the store refuses it, and says so', async () => {
    // Arrange
    const { sets } = created(spyStore([], true));

    // Act
    const out = importing(sets, fixes);
    const kept = out.ok ? await out.kept : null;

    // Assert
    expect(kept).toBe(false);
    expect(idsOf(sets, 'fix')).toEqual(['TAVRO']);
  });

  it('draws an import for the session when the store cannot be opened, and says so', async () => {
    // Arrange
    const sets = createMapSets(
      flagsOf(),
      memoryStorage(),
      Promise.reject(new Error('no IndexedDB')),
    );

    // Act
    const out = importing(sets, fixes);
    const kept = out.ok ? await out.kept : null;

    // Assert
    expect(kept).toBe(false);
    expect(sets.mapSets().map((s) => s.identity)).toEqual(['my-fixes', BUILTIN_ID]);
  });
});

/** Runs a change, then waits for the store writes it began. */
const writing = async (sets: ReturnType<typeof createMapSets>, change: () => unknown) => {
  change();
  await sets.hydrated;
};

describe('the time of an import', () => {
  it('is written anew when a set is imported again', async () => {
    // Arrange
    const { sets, records } = created();
    importing(sets, fixes);
    importing(sets, more);
    await sets.hydrated;

    // Act
    await writing(sets, () => importing(sets, fixes));

    // Assert
    expect([...records.values()].map((r) => [r.identity, r.imported])).toEqual([
      ['my-fixes', 103],
      ['more-fixes', 102],
    ]);
  });
});

describe('flags an earlier version kept', () => {
  it("moves the built-in flag and the records' flags into the list, once", async () => {
    // Arrange
    const storage = memoryStorage({ [OLD_KEY]: '{"builtinEnabled":false}' });
    const spy = spyStore([flagged(fixes, false), flagged(more, true)]);

    // Act
    const { flags, sets } = created(spy, storage);
    await sets.hydrated;

    // Assert
    expect(flags.disabled().toSorted()).toEqual([BUILTIN_ID, 'my-fixes'].toSorted());
    expect(storage.getItem(OLD_KEY)).toBeNull();
  });

  it('ignores the flag on a record once the old key is gone', async () => {
    // Arrange
    const { sets, flags } = created(spyStore([flagged(fixes, false)]));

    // Act
    await sets.hydrated;

    // Assert
    expect(flags.disabled()).toEqual([]);
    expect(sets.isEnabled('my-fixes')).toBe(true);
  });

  it('drops the old key even when the store cannot be opened', async () => {
    // Arrange
    const storage = memoryStorage({ [OLD_KEY]: '{"builtinEnabled":false}' });
    const flags = flagsOf();
    const refused = Promise.reject(new Error('no store'));

    // Act
    const sets = createMapSets(flags, storage, refused, ticking());
    await sets.hydrated;

    // Assert
    expect(flags.disabled()).toEqual([BUILTIN_ID]);
    expect(storage.getItem(OLD_KEY)).toBeNull();
  });
});

describe('importNote', () => {
  it('reports a failure or an unsaved import, and nothing for a clean one', async () => {
    // Arrange
    const results = [
      { ok: false as const, message: 'title: expected string' },
      { ok: true as const, kept: Promise.resolve(false) },
      { ok: true as const, kept: Promise.resolve(true) },
    ];

    // Act
    const notes = await Promise.all(results.map(importNote));

    // Assert
    expect(notes).toEqual([
      'title: expected string',
      'imported for this session only: browser storage is full',
      null,
    ]);
  });
});

describe('armRemoval', () => {
  it('arms on the first click, removes on the second, and re-arms when another set is clicked', () => {
    // Arrange
    const clicks: [string | null, string][] = [
      [null, 'a'],
      ['a', 'a'],
      ['a', 'b'],
    ];

    // Act
    const out = clicks.map(([armed, clicked]) => armRemoval(armed, clicked));

    // Assert
    expect(out).toEqual([
      { armed: 'a', remove: null },
      { armed: null, remove: 'a' },
      { armed: 'b', remove: null },
    ]);
  });
});

describe('the topology of the chart', () => {
  it('is one object across reads, holding the chart of the sets', () => {
    // Arrange
    const { sets } = created();
    importing(sets, fixes);

    // Act
    const [first, second] = [sets.topology(), sets.topology()];

    // Assert
    expect(second).toBe(first);
    expect(first.chart.map((item) => item.layer)).toEqual(['fix']);
  });

  it('follows the sets through every change, read just before it', async () => {
    // Arrange
    const withBoth = () => {
      const made = created();
      made.sets.setBuiltinMapSet(parsed(builtIn));
      importing(made.sets, fixes);
      return made.sets;
    };
    const offThenOn = (identity: string) => {
      const sets = withBoth();
      sets.toggleMapSet(identity);
      return sets;
    };
    const stale = created(spyStore([stored(fixes)])).sets;
    const arriving = created().sets;
    const importingInto = created().sets;
    const removingFrom = withBoth();
    const switchedOff = withBoth();
    const builtinOff = withBoth();
    const backOn = offThenOn('my-fixes');
    const builtinBackOn = offThenOn(BUILTIN_ID);
    const rows: [ReturnType<typeof createMapSets>, () => unknown, string[]][] = [
      [arriving, () => arriving.setBuiltinMapSet(parsed(builtIn)), ['NIMBA']],
      [importingInto, () => importing(importingInto, fixes), ['TAVRO']],
      [removingFrom, () => removingFrom.removeMapSet('my-fixes'), ['NIMBA']],
      [switchedOff, () => switchedOff.toggleMapSet('my-fixes'), ['NIMBA']],
      [builtinOff, () => builtinOff.toggleMapSet(BUILTIN_ID), ['TAVRO']],
      [backOn, () => backOn.toggleMapSet('my-fixes'), ['TAVRO', 'NIMBA']],
      [builtinBackOn, () => builtinBackOn.toggleMapSet(BUILTIN_ID), ['TAVRO', 'NIMBA']],
      [stale, () => stale.hydrated, ['TAVRO']],
    ];
    for (const [sets] of rows) sets.topology();

    // Act
    await Promise.all(rows.map(([, change]) => change()));

    // Assert
    expect(rows.map(([sets]) => idsOf(sets, 'fix'))).toEqual(rows.map(([, , ids]) => ids));
  });
});
