import { describe, expect, it } from 'bun:test';

import { LAPSE_SEC } from '../../lib/reports';
import { holdsAll, isLost } from './freshness';

const NOW = 1000;

describe('holdsAll', () => {
  it('holds a key heard under the lapse ago, not at it or beyond', () => {
    // Arrange
    const ages = [20, LAPSE_SEC - 0.1, LAPSE_SEC, LAPSE_SEC + 0.1];

    // Act
    const out = ages.map((age) => holdsAll({ heard: { gs: NOW - age } }, ['gs'], NOW));

    // Assert
    expect(out).toEqual([true, true, false, false]);
  });

  it('fails on one stale key and ignores a key never heard', () => {
    // Arrange
    const heard = { trackRate: NOW - 1, gs: NOW - LAPSE_SEC };

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
  it('is lost from LAPSE_SEC since the last message', () => {
    // Arrange
    const seen = [LAPSE_SEC - 0.1, LAPSE_SEC, LAPSE_SEC + 0.1];

    // Act
    const out = seen.map((s) => isLost({ seen: s }));

    // Assert
    expect(out).toEqual([false, true, true]);
  });
});
