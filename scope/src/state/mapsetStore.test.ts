import { describe, expect, it } from 'bun:test';

import { IDBFactory } from 'fake-indexeddb';

import type { MapSetData } from '../lib/mapset';
import { openMapSetStore, type StoredMapSet } from './mapsetStore';

const data = (title: string): MapSetData => ({
  type: 'FeatureCollection',
  version: 2,
  title,
  features: [],
});
const record = (identity: string, enabled = true): StoredMapSet => ({
  identity,
  enabled,
  data: data(identity),
});

describe('openMapSetStore', () => {
  it('gives back what was put, in identity order', async () => {
    // Arrange
    const store = await openMapSetStore(new IDBFactory());
    await store.put(record('beta'));
    await store.put(record('alpha'));

    // Act
    const all = await store.all();

    // Assert
    expect(all.map((s) => s.identity)).toEqual(['alpha', 'beta']);
  });

  it('keeps one record per identity, the latest', async () => {
    // Arrange
    const store = await openMapSetStore(new IDBFactory());
    await store.put(record('alpha', true));
    await store.put(record('alpha', false));

    // Act
    const all = await store.all();

    // Assert
    expect(all).toEqual([record('alpha', false)]);
  });

  it('deletes a record by identity and leaves the others', async () => {
    // Arrange
    const store = await openMapSetStore(new IDBFactory());
    await store.put(record('alpha'));
    await store.put(record('beta'));

    // Act
    const all = await store.delete('alpha').then(() => store.all());

    // Assert
    expect(all.map((s) => s.identity)).toEqual(['beta']);
  });

  it('persists across openings of the same database', async () => {
    // Arrange
    const factory = new IDBFactory();
    await (await openMapSetStore(factory)).put(record('alpha'));

    // Act
    const all = await (await openMapSetStore(factory)).all();

    // Assert
    expect(all.map((s) => s.identity)).toEqual(['alpha']);
  });

  it('rejects where IndexedDB is missing or opening throws', async () => {
    // Arrange
    const throwing = new (class extends IDBFactory {
      override open(): never {
        throw new Error('blocked');
      }
    })();

    // Act
    const outcomes = await Promise.all(
      [undefined, throwing].map((factory) =>
        openMapSetStore(factory).then(
          () => 'opened',
          () => 'rejected',
        ),
      ),
    );

    // Assert
    expect(outcomes).toEqual(['rejected', 'rejected']);
  });
});
