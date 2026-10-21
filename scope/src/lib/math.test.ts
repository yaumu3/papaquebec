import { describe, expect, it } from 'bun:test';

import { clamp, onCircle } from './math';

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

describe('onCircle', () => {
  it('wraps a value into 0 up to but not including the circle, whichever way round', () => {
    // Arrange
    const values = [-370, -10, 0, 360, 725];

    // Act
    const wrapped = values.map((v) => onCircle(v, 360));

    // Assert
    expect(wrapped).toEqual([350, 350, 0, 0, 5]);
  });
});
