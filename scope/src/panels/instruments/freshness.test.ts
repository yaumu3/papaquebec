import { describe, expect, it } from 'bun:test';

import type { HeardKey } from '../../lib/aircraft';
import { LAPSE_SEC } from '../../lib/reports';
import { AROUND_LAPSE, NOW } from '../../state/sampleFixture';
import { eachHolds, holdsAll, ifHolds, isLost } from './freshness';

describe('holdsAll', () => {
  it('holds a key heard under the lapse ago, not at it or beyond', () => {
    // Arrange
    const ages = [20, ...AROUND_LAPSE];

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

describe('eachHolds', () => {
  it('holds only when every key was heard and holds on its own, unlike holdsAll', () => {
    // Arrange
    const heard = { gs: NOW - 1, trackRate: NOW - 2, tas: NOW - LAPSE_SEC };
    const rows: HeardKey[][] = [
      ['gs', 'trackRate'],
      ['gs', 'tas'],
      ['gs', 'selAlt'],
    ];

    // Act
    const out = rows.map((keys) => [
      eachHolds({ heard }, keys, NOW),
      holdsAll({ heard }, keys, NOW),
    ]);

    // Assert
    expect(out).toEqual([
      [true, true],
      [false, false],
      [false, true],
    ]);
  });
});

describe('ifHolds', () => {
  it('gives the value while its keys hold, none once one lapses or when never heard', () => {
    // Arrange
    const heard = { gs: NOW - 1, tas: NOW - LAPSE_SEC };
    const rows: [HeardKey[], number][] = [
      [['gs'], 250],
      [['gs', 'tas'], 251],
      [['selAlt'], 252],
    ];

    // Act
    const out = rows.map(([keys, v]) => ifHolds({ heard }, keys, NOW, v));

    // Assert
    expect(out).toEqual([250, undefined, undefined]);
  });
});

describe('isLost', () => {
  it('is lost from LAPSE_SEC since the last message', () => {
    // Arrange
    const seen = AROUND_LAPSE;

    // Act
    const out = seen.map((s) => isLost({ seen: s }));

    // Assert
    expect(out).toEqual([false, true, true]);
  });
});
