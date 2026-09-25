import { describe, expect, it } from 'bun:test';

import { HISTORY_RETENTION_SEC } from '../state/trackStore';
import { loadChunkHistory } from './history';
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
