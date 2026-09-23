import { describe, expect, it } from 'bun:test';

import { parseReceiver, parseSnapshot } from './parse';

describe('parseSnapshot', () => {
  it('accepts a minimal readsb snapshot', () => {
    // Arrange
    const raw = {
      now: 1.5,
      messages: 3,
      aircraft: [{ hex: 'abc' }, { hex: 'def', lat: 1 }],
    };

    // Act
    const snap = parseSnapshot(raw);

    // Assert
    expect(snap).toEqual(raw);
  });

  it('rejects payloads that are not snapshots', () => {
    // Arrange
    const bad: unknown[] = [
      null,
      'x',
      {},
      { now: 1, messages: 1 },
      { now: 1, messages: 1, aircraft: [{}] },
    ];

    // Act
    const attempts = bad.map((b) => () => parseSnapshot(b));

    // Assert
    for (const attempt of attempts) expect(attempt).toThrow(/aircraft\.json/);
  });
});

const parseBadReceiver = () => parseReceiver('nope');

describe('parseReceiver', () => {
  it('accepts any object and rejects non-objects', () => {
    // Arrange
    const good = { lat: 1, lon: 2, history: 120 };

    // Act
    const rx = parseReceiver(good);

    // Assert
    expect(rx).toEqual(good);
    expect(parseBadReceiver).toThrow(/receiver\.json/);
  });
});
