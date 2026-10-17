import { describe, expect, it } from 'bun:test';

import { ndRangeAfter, ndRangeNm } from './nd';
import { persisted } from './settings';

describe('nd state', () => {
  it('starts on the persisted range, 20 NM with nothing stored', () => {
    // Arrange
    const stored = persisted.ndRangeNm;

    // Act
    const range = ndRangeNm();

    // Assert
    expect([stored, range]).toEqual([20, 20]);
  });
});

describe('ndRangeAfter', () => {
  it('steps out to the next range and in to the one before, none past either end', () => {
    // Arrange
    const steps = [
      { range: 20, step: -1 },
      { range: 20, step: 1 },
      { range: 40, step: -1 },
      { range: 10, step: -1 },
      { range: 80, step: 1 },
    ] as const;

    // Act
    const out = steps.map(({ range, step }) => ndRangeAfter(range, step));

    // Assert
    expect(out).toEqual([10, 40, 20, undefined, undefined]);
  });
});
