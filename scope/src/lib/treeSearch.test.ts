import { describe, expect, it } from 'bun:test';

import type { Layer, ScopeLayer } from './mapsetFormat';
import type { TreeItem, TreeItems } from './treeItems';
import { markedPieces, matches, searchTree, termsOf, type TreeSearch } from './treeSearch';

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

const item = (layer: Layer, name: string, tag = ''): TreeItem => ({
  key: `${layer}:${name}`,
  layer,
  parts: [],
  name,
  tag,
});

const TREE: TreeItems = new Map<ScopeLayer, TreeItem[]>([
  ['ctr', [item('ctr', 'CTRL'), item('ctr', 'DANZER'), item('ctr', 'PAPAQ')]],
  ['tma', [item('tma', 'PAPAQ'), item('tma', 'QUINN')]],
  [
    'sector',
    [
      item('sector', 'QB1', '335+'),
      item('sector', 'ZA1', '335−'),
      item('sector', 'ZA2', '250–335'),
    ],
  ],
  ['vfr', [item('vfr', 'QVP1', 'XQPA')]],
]);

const namesIn = ({ layers }: TreeSearch) =>
  Object.fromEntries([...layers].map(([layer, items]) => [layer, items.map((i) => i.name)]));

describe('searchTree', () => {
  it('lists only the items every term names, or whose layer or group a term names', () => {
    // Arrange
    const rows: [string, Record<string, string[]>][] = [
      ['PAPAQ CTR', { ctr: ['PAPAQ'] }],
      ['ZA SECT', { sector: ['ZA1', 'ZA2'] }],
      ['NOPE', {}],
    ];

    // Act
    const results = rows.map(([query]) => namesIn(searchTree(TREE, termsOf(query))));

    // Assert
    expect(results).toEqual(rows.map(([, expected]) => expected));
  });

  it('lists the tags it finds', () => {
    // Arrange
    const rows: [string, Record<string, string[]>][] = [
      ['335', { sector: ['QB1', 'ZA1'] }],
      ['335−', { sector: ['ZA1'] }],
      ['XQPA', { vfr: ['QVP1'] }],
    ];

    // Act
    const results = rows.map(([query]) => namesIn(searchTree(TREE, termsOf(query))));

    // Assert
    expect(results).toEqual(rows.map(([, expected]) => expected));
  });

  it('keeps every item of a named layer, and lists a named layer that has none', () => {
    // Arrange
    const terms = termsOf('airspace');

    // Act
    const search = searchTree(TREE, terms);

    // Assert
    expect([...search.layers.keys()]).toEqual([
      'ctr',
      'tma',
      'cta',
      'advisory',
      'sector',
      'fir',
      'asr',
    ]);
    expect(namesIn(search).ctr).toEqual(['CTRL', 'DANZER', 'PAPAQ']);
    expect(namesIn(search).asr).toEqual([]);
  });

  it('traces the items a term names on their own row, not those kept by their layer', () => {
    // Arrange
    const rows: [string, string[]][] = [
      ['CTR', ['CTRL']],
      ['PAPAQ CTR', ['PAPAQ']],
      ['AIRSPACE', []],
      ['PAPAQ', ['PAPAQ', 'PAPAQ']],
      ['NOPE', []],
    ];

    // Act
    const results = rows.map(([query]) =>
      searchTree(TREE, termsOf(query)).traced.map((i) => i.name),
    );

    // Assert
    expect(results).toEqual(rows.map(([, expected]) => expected));
  });
});
