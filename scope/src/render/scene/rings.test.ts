import { describe, expect, it } from 'bun:test';

import { ringRadii, ringStepNm } from './rings';

describe('range rings', () => {
  it('spaces rings by 5, 10 or 20 NM depending on the displayed range', () => {
    // Arrange
    const ranges = [10, 20, 40, 80, 200];

    // Act
    const steps = ranges.map(ringStepNm);

    // Assert
    expect(steps).toEqual([5, 5, 10, 10, 20]);
  });

  it('lists every ring radius up to and including the range', () => {
    // Arrange
    const range = 40;

    // Act
    const radii = ringRadii(range);

    // Assert
    expect(radii).toEqual([10, 20, 30, 40]);
  });

  it('handles ranges between presets, stopping at the last full step', () => {
    // Arrange
    const range = 35;

    // Act
    const radii = ringRadii(range);

    // Assert
    expect(radii).toEqual([10, 20, 30]);
  });
});
