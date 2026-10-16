import { describe, expect, it } from 'bun:test';

import { holds } from './reports';

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
