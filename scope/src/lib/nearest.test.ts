import { describe, expect, it } from 'bun:test';

import { nearestInTime } from './nearest';

describe('nearestInTime', () => {
  it('finds the item nearest in time, the earlier of two as near, and none among none', () => {
    // Arrange
    const items = [{ t: 100 }, { t: 110 }, { t: 120 }];

    // Act
    const found = [nearestInTime(items, 113), nearestInTime(items, 115), nearestInTime([], 115)];

    // Assert
    expect(found.map((i) => i?.t)).toEqual([110, 110, undefined]);
  });
});
