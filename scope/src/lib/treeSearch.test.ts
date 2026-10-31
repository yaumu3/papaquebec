import { describe, expect, it } from 'bun:test';

import { markedPieces, matches, termsOf } from './treeSearch';

describe('termsOf', () => {
  it('upper-cases the query and splits it at spaces into non-empty terms', () => {
    // Arrange
    const rows: [string, string[]][] = [
      ['zambu ctr', ['ZAMBU', 'CTR']],
      ['  zambu   ctr ', ['ZAMBU', 'CTR']],
      ['', []],
      ['   ', []],
      ['zambu2.kinra', ['ZAMBU2.KINRA']],
    ];

    // Act
    const results = rows.map(([query]) => termsOf(query));

    // Assert
    expect(results).toEqual(rows.map(([, terms]) => terms));
  });
});

describe('matches', () => {
  it('holds when the term starts a word of one of the texts', () => {
    // Arrange
    const rows: [string, string[], boolean][] = [
      ['ZA', ['ZAMBU'], true],
      ['ZA', ['ZAMBU2.KINRA'], true],
      ['ZA', ['BAZAR'], false],
      ['KIN', ['ZAMBU2.KINRA'], true],
      ['KIN', ['ZAMBU2 KINRA'], true],
      ['KIN', ['ZAMBU2/KINRA'], true],
      ['KIN', ['ZAMBU2-KINRA'], true],
      ['KIN', ['ZAMBU2(KINRA)'], true],
      ['KIN', ['(ZAMBU2)KINRA'], true],
      ['KIN', ['ZAMBU2,KINRA'], false],
      ['KIN', ['ZAMBU2KINRA'], false],
      ['ZAMBU2.KINRA', ['ZAMBU2.KINRA'], true],
      ['ZA', ['Zambu'], true],
      ['ZA', ['BAZAR', 'ZAMBU'], true],
      ['ZA', [], false],
    ];

    // Act
    const verdicts = rows.map(([term, texts]) => matches(term, texts));

    // Assert
    expect(verdicts).toEqual(rows.map(([, , expected]) => expected));
  });
});

describe('markedPieces', () => {
  it('cuts a text into pieces, marking where the terms match', () => {
    // Arrange
    const rows: [string, string[], [string, boolean][]][] = [
      ['ZAMBU', [], [['ZAMBU', false]]],
      ['', ['ZA'], []],
      [
        'ZAMBU',
        ['ZA'],
        [
          ['ZA', true],
          ['MBU', false],
        ],
      ],
      [
        'Zambu',
        ['ZA'],
        [
          ['Za', true],
          ['mbu', false],
        ],
      ],
      [
        'ZAMBU2.KINRA',
        ['KIN'],
        [
          ['ZAMBU2.', false],
          ['KIN', true],
          ['RA', false],
        ],
      ],
      [
        'ZAMBU ZAMBU',
        ['ZA'],
        [
          ['ZA', true],
          ['MBU ', false],
          ['ZA', true],
          ['MBU', false],
        ],
      ],
      [
        'ZAMBU',
        ['ZA', 'ZAMB'],
        [
          ['ZAMB', true],
          ['U', false],
        ],
      ],
      [
        'ZAMBU KIN',
        ['ZA', 'KI'],
        [
          ['ZA', true],
          ['MBU ', false],
          ['KI', true],
          ['N', false],
        ],
      ],
      ['BAZAR', ['ZA'], [['BAZAR', false]]],
    ];

    // Act
    const results = rows.map(([text, terms]) =>
      markedPieces(text, terms).map(({ text: piece, marked }) => [piece, marked]),
    );

    // Assert
    expect(results).toEqual(rows.map(([, , pieces]) => pieces));
  });
});
