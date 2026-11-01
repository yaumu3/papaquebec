import { describe, expect, it } from 'bun:test';

import { pfdGeometry } from './geometry';
import { vsiDigits } from './vsiGeometry';

describe('vsiDigits', () => {
  it('prints from 400 fpm, to 50', () => {
    // Arrange
    const g = pfdGeometry(346);
    const rates = [399, 400, 1820, -2210];

    // Act
    const out = rates.map((v) => vsiDigits(g, v)?.text);

    // Assert
    expect(out).toEqual([undefined, '400', '1800', '2200']);
  });
});
