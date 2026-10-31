import { describe, expect, it } from 'bun:test';

import type { ItemPart } from './chart';
import { isUpperStratum } from './stratum';

const area = (lower?: string): ItemPart => ({
  geometry: { type: 'Polygon', coordinates: [] },
  properties: { layer: 'sector', name: 'X', ...(lower ? { lower } : {}) },
});

describe('isUpperStratum', () => {
  it('holds for a lower limit above the surface, and for nothing else', () => {
    // Arrange
    const rows: [string | undefined, boolean][] = [
      [undefined, false],
      ['SFC', false],
      ['GND', false],
      ['0FT', false],
      ['0FT AGL', false],
      ['FL145', true],
      ['5000FT', true],
      ['2500FT AGL', true],
      ['UNL', true],
    ];

    // Act
    const verdicts = rows.map(([lower]) => isUpperStratum(area(lower)));

    // Assert
    expect(verdicts).toEqual(rows.map(([, expected]) => expected));
  });

  it('does not hold for a part without limits, such as a point', () => {
    // Arrange
    const point: ItemPart = {
      geometry: { type: 'Point', coordinates: [139.78, 35.55] },
      properties: { layer: 'ad', id: 'QAAA' },
    };

    // Act
    const verdict = isUpperStratum(point);

    // Assert
    expect(verdict).toBe(false);
  });
});
