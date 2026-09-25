import { describe, expect, it } from 'bun:test';

import { HISTORY_RETENTION_SEC } from '../state/trackStore';
import { loadChunkHistory, wasSuspended } from './history';
import type { FetchLike } from './source';

function fakeFetch(bodies: Record<string, unknown>): FetchLike {
  return (url) => {
    const body = bodies[url];
    return Promise.resolve(
      new Response(JSON.stringify(body ?? null), { status: body ? 200 : 404 }),
    );
  };
}

const frame = (now: number) => ({ now, messages: 0, aircraft: [] });

describe('loadChunkHistory', () => {
  it('merges the chunks in time order within the retention window', async () => {
    // Arrange
    const latest = 10_000;
    const tooOld = latest - HISTORY_RETENTION_SEC - 120;
    const fetchFn = fakeFetch({
      '/chunks/chunks.json': { chunks: ['a.gz', 'b.gz', 'missing.gz'] },
      '/chunks/a.gz': { files: [frame(latest), frame(tooOld)] },
      '/chunks/b.gz': { files: [frame(latest - 8)] },
    });

    // Act
    const frames = await loadChunkHistory(fetchFn, '/chunks');

    // Assert
    expect(frames.map((f) => f.now)).toEqual([latest - 8, latest]);
  });
});

describe('loadChunkHistory after a suspension', () => {
  it('replays only the frames newer than the last one seen', async () => {
    // Arrange
    const lastSeen = 10_000;
    const fetchFn = fakeFetch({
      '/chunks/chunks.json': { chunks: ['a.gz'] },
      '/chunks/a.gz': { files: [frame(lastSeen - 8), frame(lastSeen), frame(lastSeen + 8)] },
    });

    // Act
    const frames = await loadChunkHistory(fetchFn, '/chunks', lastSeen);

    // Assert
    expect(frames.map((f) => f.now)).toEqual([lastSeen + 8]);
  });
});

describe('wasSuspended', () => {
  it('tells a frozen timer from an ordinary late tick', () => {
    // Arrange
    const lastPolledAt = 1_000_000;
    const cases = [
      { now: lastPolledAt + 1_050, want: false },
      { now: lastPolledAt + 5_000, want: false },
      { now: lastPolledAt + 45_000, want: true },
    ];

    // Act
    const got = cases.map((c) => wasSuspended(lastPolledAt, c.now));

    // Assert
    expect(got).toEqual(cases.map((c) => c.want));
  });
});
