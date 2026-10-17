import { describe, expect, it } from 'bun:test';

import { advisoryBelow } from './header';

describe('advisoryBelow', () => {
  it('keeps the advisory beside the flight while both fit the line, gap and all', () => {
    // Arrange
    const cases = [
      { flight: 248, gap: 8, advisory: 80, room: 351 },
      { flight: 248, gap: 8, advisory: 80, room: 336 },
      { flight: 248, gap: 8, advisory: 80, room: 335 },
      { flight: 248, gap: 8, advisory: 0, room: 248 },
    ];

    // Act
    const below = cases.map(advisoryBelow);

    // Assert
    expect(below).toEqual([false, false, true, false]);
  });
});
