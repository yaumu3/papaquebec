import { describe, expect, it } from 'bun:test';

import { AROUND_LAPSE } from '../state/sampleFixture';
import type { HeardKey } from './aircraft';
import { holds, oldestHeard, withinLapse } from './reports';

describe('holds', () => {
  it('holds while the report is younger than the lapse, and never without one', () => {
    // Arrange
    const cases: [number | undefined, number][] = [
      [982.1, 1000],
      [982, 1000],
      [1000, 1000],
      [undefined, 1000],
    ];

    // Act
    const held = cases.map(([heardAt, now]) => holds(heardAt, now, 18));

    // Assert
    expect(held).toEqual([true, false, true, false]);
  });
});

describe('oldestHeard', () => {
  it('takes the earliest instant of the keys heard, none when none is', () => {
    // Arrange
    const heard = { trackRate: 990, gs: 980, windDir: 8 };
    const rows: HeardKey[][] = [
      ['trackRate', 'gs'],
      ['gs', 'selAlt'],
      ['selAlt'],
      ['windSpeed', 'windDir'],
      [],
    ];

    // Act
    const out = rows.map((keys) => oldestHeard(heard, keys));

    // Assert
    expect(out).toEqual([980, 980, undefined, 8, undefined]);
  });
});

describe('withinLapse', () => {
  it('is true under the lapse apart, either way round, and false at it or beyond', () => {
    // Arrange
    const gaps = AROUND_LAPSE;

    // Act
    const out = gaps.flatMap((gap) => [withinLapse(100, 100 + gap), withinLapse(100 + gap, 100)]);

    // Assert
    expect(out).toEqual([true, true, false, false, false, false]);
  });
});
