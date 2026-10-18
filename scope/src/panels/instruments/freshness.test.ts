import { describe, expect, it } from 'bun:test';

import { INSTRUMENT_SEC } from '../../lib/reports';
import { holdsAll, isLost, oldestHeard } from './freshness';

const NOW = 1000;

describe('oldestHeard', () => {
  it('takes the earliest instant of the keys heard, none when none is', () => {
    // Arrange
    const heard = { trackRate: 990, gs: 980 };

    // Act
    const out = [
      oldestHeard(heard, ['trackRate', 'gs']),
      oldestHeard(heard, ['gs', 'selAlt']),
      oldestHeard(heard, ['selAlt']),
    ];

    // Assert
    expect(out).toEqual([980, 980, undefined]);
  });
});

describe('holdsAll', () => {
  it('fails on one stale key and ignores a key never heard', () => {
    // Arrange
    const heard = { trackRate: NOW - 1, gs: NOW - INSTRUMENT_SEC };

    // Act
    const out = [
      holdsAll({ heard }, ['trackRate'], NOW),
      holdsAll({ heard }, ['trackRate', 'gs'], NOW),
      holdsAll({ heard }, ['trackRate', 'selAlt'], NOW),
      holdsAll({ heard }, ['selAlt'], NOW),
    ];

    // Assert
    expect(out).toEqual([true, false, true, false]);
  });
});

describe('isLost', () => {
  it('is lost from INSTRUMENT_SEC since the last message', () => {
    // Arrange
    const seen = [INSTRUMENT_SEC - 0.1, INSTRUMENT_SEC];

    // Act
    const out = seen.map((s) => isLost({ seen: s }));

    // Assert
    expect(out).toEqual([false, true]);
  });
});
