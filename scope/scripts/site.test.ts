import { describe, expect, it } from 'bun:test';

import { resolveSite } from './site';

/** A receiver that reports no position. */
const noPosition = () => Promise.resolve(new Response(JSON.stringify({ version: 'x' })));
/** A fetch that must not be reached. */
const unreachable = () => Promise.reject(new Error('should not be called'));

describe('resolveSite', () => {
  it('takes lat and lon from the arguments when both are given', async () => {
    // Arrange
    const fetchFn = unreachable;

    // Act
    const out = await resolveSite(['35.765', '140.386'], {}, fetchFn); // RJAA

    // Assert
    expect(out).toEqual({ lat: 35.765, lon: 140.386 });
  });

  it('otherwise takes the site from PQ_SITE', async () => {
    // Arrange
    const fetchFn = unreachable;

    // Act
    const out = await resolveSite([], { PQ_SITE: '35.6,140.0' }, fetchFn); // Chiba

    // Assert
    expect(out).toEqual({ lat: 35.6, lon: 140.0 });
  });

  it('otherwise asks the tar1090 named by PQ_TAR1090 for its position', async () => {
    // Arrange
    const calls: string[] = [];
    const fetchFn = (url: string) => {
      calls.push(url);
      return Promise.resolve(
        new Response(JSON.stringify({ lat: 35.6, lon: 140.0, version: 'x' })), // Chiba
      );
    };

    // Act
    const out = await resolveSite([], { PQ_TAR1090: 'http://pi' }, fetchFn);

    // Assert
    expect(calls).toEqual(['http://pi/data/receiver.json']);
    expect(out).toEqual({ lat: 35.6, lon: 140.0 });
  });

  it('rejects when tar1090 has no position and none was given', async () => {
    // Arrange
    const fetchFn = noPosition;

    // Act
    const out = resolveSite([], { PQ_TAR1090: 'http://pi' }, fetchFn).then(
      () => null,
      (e: unknown) => (e instanceof Error ? e.message : String(e)),
    );

    // Assert
    expect(await out).toContain('PQ_SITE');
  });

  it('rejects when neither a site nor a tar1090 is named', async () => {
    // Arrange
    const fetchFn = unreachable;

    // Act
    const out = resolveSite([], {}, fetchFn).then(
      () => null,
      (e: unknown) => (e instanceof Error ? e.message : String(e)),
    );

    // Assert
    expect(await out).toContain('PQ_TAR1090');
  });
});
