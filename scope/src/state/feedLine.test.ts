import { describe, expect, it } from 'bun:test';

import { DEAD_AFTER_MS, describeDown, feedNotice, feedState, STALE_AFTER_MS } from './feedLine';

describe('feedState', () => {
  it('tells the feed by the age of its data, from when the page was shown', () => {
    // Arrange
    const cases = [
      { lastAt: 1000, shownAt: 0, now: 1000 + STALE_AFTER_MS },
      { lastAt: 1000, shownAt: 0, now: 1001 + STALE_AFTER_MS },
      { lastAt: 1000, shownAt: 0, now: 1000 + DEAD_AFTER_MS },
      { lastAt: null, shownAt: 0, now: DEAD_AFTER_MS - 1 },
      { lastAt: null, shownAt: 0, now: DEAD_AFTER_MS },
    ];

    // Act
    const states = cases.map(({ now, ...status }) => feedState({ ...status, reason: null }, now));

    // Assert
    expect(states).toEqual(['rx', 'waiting', 'dead', 'waiting', 'dead']);
  });

  it('does not count the time the page was hidden against the feed', () => {
    // Arrange
    const reason = { kind: 'late', wait: 'frame', ms: 10_000 } as const;
    const status = { lastAt: 1000, shownAt: 100_000, reason };

    // Act
    const state = feedState(status, 101_000);

    // Assert
    expect(state).toBe('waiting');
  });
});

describe('feedNotice', () => {
  it('is empty while receiving and otherwise says what is wrong', () => {
    // Arrange
    const cases = [
      { lastAt: 12_000, shownAt: 0, reason: null },
      { lastAt: 1000, shownAt: 0, reason: { kind: 'late', wait: 'connecting', ms: 10_000 } },
      { lastAt: null, shownAt: 0, reason: null },
      { lastAt: -20_000, shownAt: -40_000, reason: { kind: 'failed', message: 'HTTP 502' } },
      { lastAt: null, shownAt: -40_000, reason: null },
    ] as const;

    // Act
    const out = cases.map((c) => feedNotice(c, 13_000));

    // Assert
    expect(out).toEqual([
      null,
      { cls: 'warn', text: 'STALE 12s' },
      { cls: 'warn', text: 'CONNECTING' },
      { cls: 'err', text: 'DEAD · HTTP 502' },
      { cls: 'err', text: 'DEAD · no data' },
    ]);
  });
});

describe('describeDown', () => {
  it('words each way the feed goes down', () => {
    // Arrange
    const reasons = [
      { kind: 'ended' },
      { kind: 'late', wait: 'info', ms: 10_000 },
      { kind: 'late', wait: 'connecting', ms: 10_000 },
      { kind: 'late', wait: 'stream', ms: 10_000 },
      { kind: 'late', wait: 'frame', ms: 2500 },
      { kind: 'failed', message: 'HTTP 502' },
      { kind: 'unsupported' },
    ] as const;

    // Act
    const words = reasons.map(describeDown);

    // Assert
    expect(words).toEqual([
      'the feeder ended the session',
      'no feed info in 10 s',
      'not connected in 10 s',
      'no stream in 10 s',
      'no frame in 2.5 s',
      'HTTP 502',
      'this browser has no WebTransport',
    ]);
  });
});
