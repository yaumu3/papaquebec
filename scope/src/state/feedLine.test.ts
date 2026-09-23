import { describe, expect, it } from 'bun:test';

import { feedNotice, markStale, STALE_AFTER_MS } from './feedLine';

describe('markStale', () => {
  it('turns a receiving feed stale once nothing has arrived for the stale window', () => {
    // Arrange
    const current = { kind: 'rx', lastAt: 1000 } as const;

    // Act
    const out = markStale(current, 1000 + STALE_AFTER_MS + 1);

    // Assert
    expect(out).toEqual({ kind: 'stale', lastAt: 1000 });
  });

  it('leaves a fresh, dead or connecting feed as it is', () => {
    // Arrange
    const cases = [
      { kind: 'rx', lastAt: 1000 },
      { kind: 'dead', message: 'HTTP 502', since: 1000 },
      { kind: 'connecting' },
    ] as const;

    // Act
    const out = cases.map((c) => markStale(c, 1000 + STALE_AFTER_MS));

    // Assert
    expect(out).toEqual([cases[0], cases[1], cases[2]]);
  });
});

describe('feedNotice', () => {
  it('is empty while receiving and otherwise says what is wrong', () => {
    // Arrange
    const cases = [
      { kind: 'rx', lastAt: 1000 },
      { kind: 'stale', lastAt: 1000 },
      { kind: 'dead', message: 'HTTP 502', since: 1000 },
      { kind: 'connecting' },
    ] as const;

    // Act
    const out = cases.map((c) => feedNotice(c, 13_000));

    // Assert
    expect(out).toEqual([
      null,
      { cls: 'warn', text: 'STALE 12s' },
      { cls: 'err', text: 'DEAD · HTTP 502' },
      { cls: 'warn', text: 'CONNECTING' },
    ]);
  });
});
