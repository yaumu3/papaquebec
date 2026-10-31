import { describe, expect, it } from 'bun:test';

import type { ItemPart } from './chart';
import { isUpperStratum, stratumTag } from './stratum';

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

const sector = (lower?: string, upper?: string): ItemPart => ({
  geometry: { type: 'Polygon', coordinates: [] },
  properties: {
    layer: 'sector',
    name: 'X',
    ...(lower ? { lower } : {}),
    ...(upper ? { upper } : {}),
  },
});

describe('stratumTag', () => {
  it('writes the band of an item from its parts, compared in feet', () => {
    // Arrange
    const rows: [string, [string | undefined, string | undefined][], string][] = [
      ['surface to a limit', [['SFC', 'FL335']], '335−'],
      ['a limit to unlimited', [['FL335', 'UNL']], '335+'],
      ['between two limits', [['FL250', 'FL335']], '250–335'],
      ['surface to unlimited', [['SFC', 'UNL']], ''],
      ['no lower limit is the surface', [[undefined, 'FL335']], '335−'],
      ['GND is the surface', [['GND', 'FL335']], '335−'],
      ['0FT is the surface', [['0FT', 'FL335']], '335−'],
      ['no upper limit is unlimited', [['FL335', undefined]], '335+'],
      ['a limit that is not a level, as published', [['SFC', '9000FT']], '9000FT−'],
      ['AGL as published', [['2500FT AGL', 'FL100']], '2500FT AGL–100'],
      [
        'the lowest lower limit in feet, not as text',
        [
          ['5000FT', 'FL200'],
          ['FL040', 'FL200'],
        ],
        '040–200',
      ],
      [
        'the highest upper limit in feet, not as text',
        [
          ['SFC', 'FL100'],
          ['SFC', '12000FT'],
        ],
        '12000FT−',
      ],
      [
        'two strata that together span everything',
        [
          ['SFC', 'FL375'],
          ['FL375', 'UNL'],
        ],
        '',
      ],
    ];

    // Act
    const tags = rows.map(([, bands]) =>
      stratumTag(bands.map(([lower, upper]) => sector(lower, upper))),
    );

    // Assert
    expect(tags).toEqual(rows.map(([, , expected]) => expected));
  });
});
