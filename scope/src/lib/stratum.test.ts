import { describe, expect, it } from 'bun:test';

import { partOf, point, sectorPart } from '../render/scene/chartFixture';
import type { ItemPart } from './chart';
import { bandOf, fractionOf, isUpperStratum, limitInHundreds, stratumTag } from './stratum';

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
    const verdicts = rows.map(([lower]) => isUpperStratum(sectorPart(lower)));

    // Assert
    expect(verdicts).toEqual(rows.map(([, expected]) => expected));
  });

  it('does not hold for a part without limits, such as a point', () => {
    // Arrange
    const pointPart = partOf('ad', point([139.78, 35.55]));

    // Act
    const verdict = isUpperStratum(pointPart);

    // Assert
    expect(verdict).toBe(false);
  });
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
      stratumTag(bands.map(([lower, upper]) => sectorPart(lower, upper))),
    );

    // Assert
    expect(tags).toEqual(rows.map(([, , expected]) => expected));
  });
});

describe('bandOf', () => {
  it('takes the lowest lower and the highest upper limit over the parts, in feet', () => {
    // Arrange
    const rows: [ItemPart[], { lower: string; upper: string }][] = [
      [[sectorPart('SFC', 'FL240'), sectorPart('SFC', 'FL160')], { lower: 'SFC', upper: 'FL240' }],
      [
        [sectorPart('5000FT', '12000FT'), sectorPart('FL095', 'FL100')],
        { lower: '5000FT', upper: '12000FT' },
      ],
      [[sectorPart(), sectorPart()], { lower: 'SFC', upper: 'UNL' }],
    ];

    // Act
    const bands = rows.map(([parts]) => bandOf(parts));

    // Assert
    expect(bands).toEqual(rows.map(([, expected]) => expected));
  });
});

describe('limitInHundreds', () => {
  it('writes a limit in hundreds of feet, rounded and padded to three digits', () => {
    // Arrange
    const rows: [string, string][] = [
      ['3000FT', '030'],
      ['12000FT', '120'],
      ['FL240', '240'],
      ['FL95', '095'],
      ['SFC', 'SFC'],
      ['GND', 'SFC'],
      ['UNL', 'UNL'],
      ['1500FT AGL', '015 AGL'],
      ['35000FT', '350'],
      ['250FT', '003'],
    ];

    // Act
    const written = rows.map(([limit]) => limitInHundreds(limit));

    // Assert
    expect(written).toEqual(rows.map(([, expected]) => expected));
  });
});

describe('fractionOf', () => {
  it('writes the item band as upper over lower, and nothing for an item with no limits', () => {
    // Arrange
    const rows: [ItemPart[], { upper: string; lower: string } | undefined][] = [
      [[sectorPart('SFC', 'FL240'), sectorPart('SFC', 'FL160')], { upper: '240', lower: 'SFC' }],
      [[sectorPart('SFC', '3000FT')], { upper: '030', lower: 'SFC' }],
      [[sectorPart('GND', '12000FT')], { upper: '120', lower: 'SFC' }],
      [[sectorPart(undefined, 'FL335')], { upper: '335', lower: 'SFC' }],
      [[sectorPart('FL335')], { upper: 'UNL', lower: '335' }],
      [[sectorPart(), sectorPart()], undefined],
    ];

    // Act
    const fractions = rows.map(([parts]) => fractionOf(parts));

    // Assert
    expect(fractions).toEqual(rows.map(([, expected]) => expected));
  });
});
