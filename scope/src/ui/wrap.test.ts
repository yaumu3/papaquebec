import { describe, expect, it } from 'bun:test';

import { wrapIndex } from './wrap';

describe('wrapIndex', () => {
  it('steps to the next or the previous of a ring, round either end, and in from outside it', () => {
    // Arrange
    const steps: [number, boolean][] = [
      [0, false],
      [3, false],
      [0, true],
      [2, true],
      [-1, false],
      [-1, true],
    ];

    // Act
    const next = steps.map(([i, back]) => wrapIndex(i, 4, back));

    // Assert
    expect(next).toEqual([1, 0, 3, 1, 0, 3]);
  });
});
