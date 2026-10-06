import { describe, expect, it } from 'bun:test';

import { clamp } from './math';

describe('clamp', () => {
  it('holds a value within its bounds', () => {
    // Arrange
    const values = [-1, 3, 12];

    // Act
    const held = values.map((v) => clamp(v, 0, 10));

    // Assert
    expect(held).toEqual([0, 3, 10]);
  });
});
