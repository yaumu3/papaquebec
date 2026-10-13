import { describe, expect, it } from 'bun:test';

import { hpaToInHg } from './metar';

describe('hpaToInHg', () => {
  it('converts standard pressure to 29.92 rounded to a hundredth', () => {
    // Arrange
    const hpa = [1013.25, 1014, 990];

    // Act
    const out = hpa.map(hpaToInHg);

    // Assert
    expect(out).toEqual([29.92, 29.94, 29.23]);
  });
});
