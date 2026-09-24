import { describe, expect, it } from 'bun:test';

import { type Band, type BandLimits, withLower, withUpper } from './band';

const limits: BandLimits = { min: 0, max: 600, gap: 10 };
const band: Band = { lower: 50, upper: 200 };

describe('withLower', () => {
  it('moves the lower edge and pushes the upper edge to keep the gap', () => {
    // Arrange
    const values = [30, 195];

    // Act
    const out = values.map((v) => withLower(band, v, limits));

    // Assert
    expect(out).toEqual([
      { lower: 30, upper: 200 },
      { lower: 195, upper: 205 },
    ]);
  });
});

describe('withUpper', () => {
  it('moves the upper edge and pushes the lower edge to keep the gap', () => {
    // Arrange
    const values = [300, 55];

    // Act
    const out = values.map((v) => withUpper(band, v, limits));

    // Assert
    expect(out).toEqual([
      { lower: 50, upper: 300 },
      { lower: 45, upper: 55 },
    ]);
  });
});
