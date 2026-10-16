import { describe, expect, it } from 'bun:test';

import { epuM } from './accuracy';

describe('epuM', () => {
  it('bounds the position error of each NACp category, and of none for 0 or an unassigned one', () => {
    // Arrange
    const categories = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 12, -1];

    // Act
    const bounds = categories.map(epuM);

    // Assert
    expect(bounds).toEqual([
      3,
      10,
      30,
      92.6,
      185.2,
      555.6,
      926,
      1852,
      3704,
      7408,
      18520,
      undefined,
      undefined,
      undefined,
    ]);
  });
});
