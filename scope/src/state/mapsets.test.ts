import { describe, expect, it } from 'bun:test';

import { validateMapSet } from '../lib/mapset';
import { BUILTIN_ID } from '../lib/mapsetFormat';
import { armRemoval, createMapSets, importNote } from './mapsets';
import { MAPSETS_KEY } from './mapsetsPersist';
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
const stored = (document: object, enabled = true, imported = 0): StoredMapSet => {
  const data = parsed(document);
  return { identity: data.id ?? data.title, enabled, imported, data };
};
/** A record as stored before sets carried the time of their import. */
const legacy = (document: object): StoredMapSet => {
  const { identity, enabled, data } = stored(document);
  return JSON.parse(JSON.stringify({ identity, enabled, data }));
};
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
      writes.push(`put ${set.identity} ${set.enabled}`);
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

const created = (spy = spyStore(), storage = memoryStorage()) => ({
  ...spy,
  storage,
  sets: createMapSets(storage, Promise.resolve(spy.store), ticking()),
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
    expect(list.map((s) => [s.identity, s.builtin, s.enabled])).toEqual([[BUILTIN_ID, true, true]]);
    expect(chart).toEqual([]);
  });

  it('starts the built-in set as the stored flag left it', () => {
    // Arrange
    const storage = memoryStorage({ [MAPSETS_KEY]: '{"builtinEnabled":false}' });

    // Act
    const { sets } = created(spyStore(), storage);

    // Assert
    expect(sets.mapSets().map((s) => [s.identity, s.enabled])).toEqual([[BUILTIN_ID, false]]);
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
  it('puts the one record again to toggle a set', async () => {
    // Arrange
    const { sets, writes } = created();
    importing(sets, fixes);

    // Act
    sets.toggleMapSet('my-fixes');
    await sets.hydrated;

    // Assert
    expect(writes).toEqual(['put my-fixes true', 'put my-fixes false']);
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
    expect(writes).toEqual(['put my-fixes true', 'put more-fixes true', 'delete more-fixes']);
    expect([...records.keys()]).toEqual(['my-fixes']);
  });

  it('keeps the built-in flag in browser storage and writes no record for it', async () => {
    // Arrange
    const { sets, writes, storage } = created();

    // Act
    sets.toggleMapSet(BUILTIN_ID);
    await sets.hydrated;

    // Assert
    expect(writes).toEqual([]);
    expect(storage.getItem(MAPSETS_KEY)).toBe('{"builtinEnabled":false}');
  });

  it('merges the stored sets newest import first, the built-in set last, once hydrated', async () => {
    // Arrange
    const { sets } = created(spyStore([stored(more, true, 10), stored(fixes, false, 20)]));

    // Act
    await sets.hydrated;

    // Assert
    expect(sets.mapSets().map((s) => [s.identity, s.enabled])).toEqual([
      ['my-fixes', false],
      ['more-fixes', true],
      [BUILTIN_ID, true],
    ]);
    expect(idsOf(sets, 'navaid')).toEqual(['QDG']);
  });

  it('puts a record stored without a time behind the timed ones, in identity order, ahead of the built-in set', async () => {
    // Arrange
    const old = setOf('Old', [], 'old-set');
    const { sets } = created(spyStore([legacy(more), legacy(fixes), stored(old, true, 5)]));

    // Act
    await sets.hydrated;

    // Assert
    expect(sets.mapSets().map((s) => s.identity)).toEqual([
      'old-set',
      'more-fixes',
      'my-fixes',
      BUILTIN_ID,
    ]);
  });

  it('keeps an import made before hydration finishes, ahead of the stored ones', async () => {
    // Arrange
    const { sets } = created(
      spyStore([stored(more, true, 10), stored(setOf('Old', [], 'my-fixes'), true, 20)]),
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

  it('skips a stored record that no longer passes the strict parse', async () => {
    // Arrange
    const broken: StoredMapSet = JSON.parse(
      '{"identity":"broken","enabled":true,"data":{"title":"no type"}}',
    );
    const { sets } = created(spyStore([broken, stored(fixes)]));

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
    const sets = createMapSets(memoryStorage(), Promise.reject(new Error('no IndexedDB')));

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

  it('is kept when a set is toggled', async () => {
    // Arrange
    const { sets, records } = created();
    importing(sets, fixes);
    await sets.hydrated;

    // Act
    await writing(sets, () => sets.toggleMapSet('my-fixes'));

    // Assert
    expect([...records.values()].map((r) => [r.identity, r.enabled, r.imported])).toEqual([
      ['my-fixes', false, 101],
    ]);
  });
});

describe('a chart read before a change', () => {
  it('follows the built-in set arriving', () => {
    // Arrange
    const { sets } = created();
    sets.topology();

    // Act
    sets.setBuiltinMapSet(parsed(builtIn));

    // Assert
    expect(idsOf(sets, 'fix')).toEqual(['NIMBA']);
  });

  it('follows an import', () => {
    // Arrange
    const { sets } = created();
    sets.topology();

    // Act
    const out = importing(sets, fixes);

    // Assert
    expect(out.ok).toBe(true);
    expect(idsOf(sets, 'fix')).toEqual(['TAVRO']);
  });

  it('follows a removal', () => {
    // Arrange
    const { sets } = created();
    importing(sets, fixes);
    sets.topology();

    // Act
    sets.removeMapSet('my-fixes');

    // Assert
    expect(idsOf(sets, 'fix')).toEqual([]);
  });

  it('follows a toggle', () => {
    // Arrange
    const rows = [
      { identity: 'my-fixes', left: ['NIMBA'] },
      { identity: BUILTIN_ID, left: ['TAVRO'] },
    ].map(({ identity, left }) => {
      const { sets } = created();
      sets.setBuiltinMapSet(parsed(builtIn));
      importing(sets, fixes);
      sets.topology();
      return { identity, left, sets };
    });

    // Act
    for (const { sets, identity } of rows) sets.toggleMapSet(identity);

    // Assert
    expect(rows.map((r) => idsOf(r.sets, 'fix'))).toEqual(rows.map((r) => r.left));
  });

  it('follows a set turned back on', () => {
    // Arrange
    const rows = ['my-fixes', BUILTIN_ID].map((identity) => {
      const { sets, storage } = created();
      sets.setBuiltinMapSet(parsed(builtIn));
      importing(sets, fixes);
      sets.toggleMapSet(identity);
      sets.topology();
      return { identity, sets, storage };
    });

    // Act
    for (const { sets, identity } of rows) sets.toggleMapSet(identity);

    // Assert
    expect(rows.map((r) => idsOf(r.sets, 'fix'))).toEqual([
      ['TAVRO', 'NIMBA'],
      ['TAVRO', 'NIMBA'],
    ]);
    expect(rows.map((r) => r.storage.getItem(MAPSETS_KEY))).toEqual([
      '{"builtinEnabled":true}',
      '{"builtinEnabled":true}',
    ]);
  });

  it('follows the hydration', async () => {
    // Arrange
    const { sets } = created(spyStore([stored(more)]));
    sets.topology();

    // Act
    await sets.hydrated;

    // Assert
    expect(idsOf(sets, 'navaid')).toEqual(['QDG']);
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

  it('is rebuilt with the chart after a change to the sets', () => {
    // Arrange
    const { sets } = created();
    importing(sets, fixes);
    const before = sets.topology();

    // Act
    sets.toggleMapSet('my-fixes');

    // Assert
    expect(sets.topology()).not.toBe(before);
  });
});
