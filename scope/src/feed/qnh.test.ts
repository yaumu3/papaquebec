import { describe, expect, it } from 'bun:test';

import { fetchQnhFrom, IEM_CURRENTS, qnhSourceFromUrl } from './qnh';
import type { FetchLike } from './source';

const now = new Date('2026-09-22T11:30:00Z');

function fakeFetch(body: string, status = 200): { calls: string[]; fetch: FetchLike } {
  const calls: string[] = [];
  const fetchFn: FetchLike = (url) => {
    calls.push(url);
    return Promise.resolve(new Response(body, { status }));
  };
  return { calls, fetch: fetchFn };
}

/** Resolves to the rejection's message, or null when the promise resolved. */
const failure = (p: Promise<unknown>): Promise<string | null> =>
  p.then(
    () => null,
    (e: unknown) => (e instanceof Error ? e.message : String(e)),
  );

const iemBody = (rows: unknown[]) => JSON.stringify({ data: rows });

describe('qnhSourceFromUrl', () => {
  it('defaults to the Iowa mirror and switches to a proxied Aviation Weather Center with wx', () => {
    // Arrange
    const searches = ['?feed=readsb', '?wx=/wx/'];

    // Act
    const out = searches.map(qnhSourceFromUrl);

    // Assert
    expect(out).toEqual([{ kind: 'iem' }, { kind: 'awc', base: '/wx' }]);
  });
});

describe('fetchQnhFrom (iem)', () => {
  it('asks for every station in one request and returns the first one answered', async () => {
    // Arrange
    const f = fakeFetch(
      iemBody([
        { station: 'RJAA', utc_valid: '2026-09-22T11:30:00Z', alti: 29.97285 },
        { station: 'RJTT', utc_valid: '2026-09-22T11:30:00Z', alti: 30.00238 },
      ]),
    );

    // Act
    const out = await fetchQnhFrom(['RJTL', 'RJTT', 'RJAA'], { kind: 'iem' }, f.fetch, now);

    // Assert
    expect(f.calls).toEqual([`${IEM_CURRENTS}?station=RJTL%2CRJTT%2CRJAA`]);
    expect(out).toEqual({
      station: 'RJTT',
      observedAt: Date.parse('2026-09-22T11:30:00Z'),
      qnhInHg: 30,
    });
  });

  it('skips rows without an altimeter value', async () => {
    // Arrange
    const f = fakeFetch(
      iemBody([
        { station: 'RJTT', utc_valid: '2026-09-22T11:30:00Z', alti: null },
        { station: 'RJAA', utc_valid: '2026-09-22T11:00:00Z', alti: 29.94 },
      ]),
    );

    // Act
    const out = await fetchQnhFrom(['RJTT', 'RJAA'], { kind: 'iem' }, f.fetch, now);

    // Assert
    expect(out.station).toBe('RJAA');
  });

  it('rejects when none of the stations is in the answer', async () => {
    // Arrange
    const f = fakeFetch(iemBody([]));

    // Act
    const err = await failure(fetchQnhFrom(['RJTL', 'RJTK'], { kind: 'iem' }, f.fetch, now));

    // Assert
    expect(err).toBe('no METAR for RJTL, RJTK');
  });

  it('rejects when the source answers with an error status', async () => {
    // Arrange
    const f = fakeFetch('', 503);

    // Act
    const err = await failure(fetchQnhFrom(['RJAA'], { kind: 'iem' }, f.fetch, now));

    // Assert
    expect(err).toContain('HTTP 503');
  });
});

describe('fetchQnhFrom (awc proxy)', () => {
  it('reads raw METAR lines from the proxied Aviation Weather Center', async () => {
    // Arrange
    const f = fakeFetch('METAR RJTT 221100Z 10007KT CAVOK 25/22 Q1016 NOSIG\n');

    // Act
    const out = await fetchQnhFrom(['RJTL', 'RJTT'], { kind: 'awc', base: '/wx' }, f.fetch, now);

    // Assert
    expect(f.calls).toEqual(['/wx/metar?ids=RJTL%2CRJTT&format=raw']);
    expect(out).toEqual({
      station: 'RJTT',
      observedAt: Date.parse('2026-09-22T11:00:00Z'),
      qnhInHg: 30,
    });
  });
});
