import { describe, expect, it } from 'bun:test';

import { createReadsbSource } from './readsb';
import type { FetchLike } from './source';

function fakeFetch(bodies: Record<string, unknown>): FetchLike {
  return (url) => {
    const body = bodies[url];
    return Promise.resolve(
      new Response(JSON.stringify(body ?? null), { status: body ? 200 : 404 }),
    );
  };
}

describe('createReadsbSource', () => {
  it('polls aircraft.json under the data base and returns the snapshot as is', async () => {
    // Arrange
    const snapshot = { now: 1700000000.5, messages: 42, aircraft: [{ hex: 'abc123' }] };
    const source = createReadsbSource('/data', fakeFetch({ '/data/aircraft.json': snapshot }));

    // Act
    const got = await source.poll();

    // Assert
    expect(got).toEqual(snapshot);
  });

  it('reads receiver.json for the site', async () => {
    // Arrange
    const receiver = { lat: 33.58, lon: 130.45, refresh: 1000 }; // RJFF
    const source = createReadsbSource('/data', fakeFetch({ '/data/receiver.json': receiver }));

    // Act
    const got = await source.receiver();

    // Assert
    expect(got).toEqual(receiver);
  });

  it('rejects when the server answers anything but 200', () => {
    // Arrange
    const source = createReadsbSource('/data', fakeFetch({}));

    // Act
    const result = source.poll();

    // Assert
    return expect(result).rejects.toThrow(/404/);
  });
});
