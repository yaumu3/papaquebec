import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import { nearestInTime } from './nearest';

describe('nearestInTime', () => {
  it('finds the item nearest in time, the earlier of two as near, whatever order they come in', () => {
    // Arrange: times close enough together that two are often as near
    const anyTime = fc.integer({ min: -20, max: 20 });
    const anyItems = fc.array(
      anyTime.map((t) => ({ t })),
      { minLength: 1 },
    );

    fc.assert(
      fc.property(anyItems, anyTime, (items, t) => {
        // Act
        const found = nearestInTime(items, t);

        // Assert
        const off = (item: { t: number }) => Math.abs(item.t - t);
        const nearest = Math.min(...items.map(off));
        const asNear = items.filter((item) => off(item) === nearest);
        expect(found?.t).toBe(Math.min(...asNear.map((item) => item.t)));
      }),
    );
  });

  it('finds none among none', () => {
    // Arrange
    const items: { t: number }[] = [];

    // Act
    const found = nearestInTime(items, 115);

    // Assert
    expect(found).toBeNull();
  });
});
