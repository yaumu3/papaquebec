import { describe, expect, it } from 'bun:test';

import { relativeAltitudeLabel } from './traffic';

describe('relativeAltitudeLabel', () => {
  it('reads hundreds of feet with the sign of the rounded value, two digits at least', () => {
    // Arrange
    const rows = [0, -40, -900, 2700, 1100, 3100, -10500, 50, -50, 49, -49, -51];

    // Act
    const labels = rows.map(relativeAltitudeLabel);

    // Assert
    expect(labels).toEqual([
      '+00',
      '+00',
      '-09',
      '+27',
      '+11',
      '+31',
      '-105',
      '+01',
      '-01',
      '+00',
      '+00',
      '-01',
    ]);
  });
});
