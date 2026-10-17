import { describe, expect, it } from 'bun:test';

import { ndRangeNm } from './nd';
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
