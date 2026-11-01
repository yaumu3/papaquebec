import { describe, expect, it } from 'bun:test';

import { feat } from '../render/scene/chartFixture';
import { chartOf } from './chart';
import { type MapSetData, validateMapSet } from './mapset';
import type { Layer, ScopeLayer } from './mapsetFormat';
import { topologyOf } from './topology';
import {
  afterDot,
  groupCount,
  itemsIn,
  type LayerLeaves,
  layerSummary,
  layerTitle,
  markedPieces,
  matches,
  type RowState,
  rowStateOf,
  searchTree,
  type StateOf,
  termsOf,
  type TreeItem,
  treeItemsOf,
  type TreeItems,
  type TreeSearch,
} from './tree';
import { type LayerState, drawnItemsOf } from './visibility';
import { hiddenExcept, plainState, shownExcept } from './visibilityFixture';

/** A text with the pieces a search marks in brackets. */
const marked = (text: string, terms: readonly string[]) =>
  markedPieces(text, terms)
    .map((piece) => (piece.marked ? `[${piece.text}]` : piece.text))
    .join('');

type Position = [number, number];

const HERE: Position = [130.6, 33.7];
const RING: Position[] = [HERE, [130.7, 33.7], [130.7, 33.8], HERE];

const area = (properties: object) => feat(properties, { type: 'Polygon', coordinates: [RING] });
const route = (properties: object) =>
  feat(properties, { type: 'LineString', coordinates: [HERE, [130.8, 33.7]] });
const point = (properties: object, at: Position = HERE) =>
  feat(properties, { type: 'Point', coordinates: at });

const topologyIn = (features: object[]) => {
  const verdict = validateMapSet({
    type: 'FeatureCollection',
    version: 2,
    id: 'tree',
    title: 'tree',
    features,
  });
  if (!verdict.ok) throw new Error(verdict.message);
  const data: MapSetData = verdict.data;
  return topologyOf(chartOf([data]));
};

const hold = (at: Position, turn: 'R' | 'L' = 'R') =>
  point({ layer: 'hold', turn, inboundMag: 90, kind: 'ENR' }, at);
const fix = (id: string) => point({ layer: 'fix', id, kind: 'RPT' });
const vfr = (ad: string, at: Position) => point({ layer: 'vfr', id: 'CAUSEWAY', ad }, at);

const treeOf = (features: object[]) => treeItemsOf(topologyIn(features));

const listed = (features: object[], layer: ScopeLayer) =>
  itemsIn(treeOf(features), layer).map(({ name, tag }) => [name, tag]);

describe('treeItemsOf names and tags', () => {
  it('names an item and tags it by its layer', () => {
    // Arrange
    const rows: [string, object[], ScopeLayer, string[]][] = [
      [
        'an area by name, kind as tag',
        [area({ layer: 'ctr', name: 'PAPAQ', kind: 'ARR' })],
        'ctr',
        ['PAPAQ', 'ARR'],
      ],
      [
        'a kind equal to the layer name is hidden',
        [area({ layer: 'tma', name: 'PAPAQ', kind: 'TMA' })],
        'tma',
        ['PAPAQ', ''],
      ],
      ['an area without a kind', [area({ layer: 'ctr', name: 'PAPAQ' })], 'ctr', ['PAPAQ', '']],
      [
        'a sector by its stratum',
        [area({ layer: 'sector', name: 'T21', lower: 'SFC', upper: 'FL335' })],
        'sector',
        ['T21', '335−'],
      ],
      [
        'a route by designator and kind',
        [route({ layer: 'conv', name: 'V901', kind: 'ATS' })],
        'conv',
        ['V901', 'ATS'],
      ],
      [
        'an aerodrome by id and kind',
        [point({ layer: 'ad', id: 'XQPA', kind: 'CIVIL' })],
        'ad',
        ['XQPA', 'CIVIL'],
      ],
      [
        'a navaid by id, its kind hidden when it is the layer name',
        [point({ layer: 'navaid', id: 'QDG', kind: 'NAVAIDS' })],
        'navaid',
        ['QDG', ''],
      ],
      [
        'a fix by id, though it has a name',
        [point({ layer: 'fix', id: 'ZAMBU', name: 'Zambu', kind: 'RPT' })],
        'fix',
        ['ZAMBU', 'RPT'],
      ],
      [
        'a VFR point by id and its aerodrome',
        [point({ layer: 'vfr', id: 'QVP1', ad: 'XQPA' })],
        'vfr',
        ['QVP1', 'XQPA'],
      ],
      [
        'a VFR point without an aerodrome',
        [point({ layer: 'vfr', id: 'QVP1' })],
        'vfr',
        ['QVP1', ''],
      ],
    ];

    // Act
    const results = rows.map(([, features, layer]) => listed(features, layer));

    // Assert
    expect(results).toEqual(rows.map(([, , , expected]) => [expected]));
  });

  it("takes the first part's kind when the parts of an item differ", () => {
    // Arrange
    const features = [
      area({ layer: 'ctr', name: 'PAPAQ', kind: 'ARR' }),
      area({ layer: 'ctr', name: 'PAPAQ', kind: 'DEP' }),
    ];

    // Act
    const items = listed(features, 'ctr');

    // Assert
    expect(items).toEqual([['PAPAQ', 'ARR']]);
  });
});

describe('treeItemsOf holds', () => {
  it('names a hold by the point on its grid cell, the first in point layer order', () => {
    // Arrange
    const features = [
      point({ layer: 'fix', id: 'ZAMBU', kind: 'RPT' }),
      point({ layer: 'ad', id: 'XQPA', kind: 'CIVIL' }),
      hold([HERE[0] + 4e-6, HERE[1]]),
    ];

    // Act
    const holds = listed(features, 'hold');

    // Assert
    expect(holds).toEqual([['XQPA', 'ENR']]);
  });

  it('names a hold by its position when no point is on its cell', () => {
    // Arrange
    const features = [point({ layer: 'fix', id: 'ZAMBU', kind: 'RPT' }, [130.7, 33.7]), hold(HERE)];

    // Act
    const holds = listed(features, 'hold');

    // Assert
    expect(holds).toEqual([['33.7000 130.6000', 'ENR']]);
  });
});

describe('treeItemsOf order', () => {
  it('sorts by name, then by tag', () => {
    // Arrange
    const features = [fix('ZB'), fix('ZA'), vfr('XQPB', [130.9, 33.7]), vfr('XQPA', [131.2, 33.7])];

    // Act
    const tree = treeOf(features);

    // Assert
    expect(itemsIn(tree, 'fix').map((i) => i.name)).toEqual(['ZA', 'ZB']);
    expect(itemsIn(tree, 'vfr').map((i) => i.tag)).toEqual(['XQPA', 'XQPB']);
  });

  it('keeps chart order for items equal in name and tag', () => {
    // Arrange
    const orders: ('R' | 'L')[][] = [
      ['R', 'L'],
      ['L', 'R'],
    ];
    const topologies = orders.map((turns) => topologyIn(turns.map((turn) => hold(HERE, turn))));
    const chartKeys = topologies.map(({ chart }) => chart.map((item) => item.key));

    // Act
    const listings = topologies.map((topology) => itemsIn(treeItemsOf(topology), 'hold'));

    // Assert
    expect(chartKeys.map((keys) => keys.length)).toEqual([2, 2]);
    expect(listings.map((items) => new Set(items.map((i) => i.name + i.tag)).size)).toEqual([1, 1]);
    expect(listings.map((items) => items.map((i) => i.key))).toEqual(chartKeys);
  });
});

describe('itemsIn', () => {
  it('lists nothing for a layer without items', () => {
    // Arrange
    const tree = treeOf([point({ layer: 'fix', id: 'ZAMBU' })]);

    // Act
    const items = itemsIn(tree, 'coast');

    // Assert
    expect(items).toEqual([]);
  });
});

/** A layer with items; `listed` are those the tree lists, all of them unless a search narrows. */
const withItems = (layer: ScopeLayer, present: string[], narrowed = present): LayerLeaves => ({
  layer,
  listed: narrowed,
  present,
});

/** A layer that is its own leaf: no items. */
const leaf = (layer: ScopeLayer): LayerLeaves => ({ layer, listed: [], present: [] });

const statesOf =
  (states: Partial<Record<ScopeLayer, LayerState>>): StateOf =>
  (layer) =>
    states[layer] ?? hiddenExcept();

describe('rowStateOf', () => {
  it('is on when every leaf is shown, off when none is, and mixed otherwise', () => {
    // Arrange
    const stateOf = statesOf({
      fix: shownExcept(),
      navaid: hiddenExcept(),
      ad: hiddenExcept('a'),
      coast: shownExcept(),
      rings: hiddenExcept(),
    });
    const rows: [LayerLeaves[], RowState][] = [
      [[withItems('fix', ['a', 'b'])], 'on'],
      [[withItems('navaid', ['a', 'b'])], 'off'],
      [[withItems('ad', ['a', 'b'])], 'mixed'],
      [[leaf('coast')], 'on'],
      [[leaf('rings')], 'off'],
      [[withItems('fix', ['a']), leaf('coast')], 'on'],
      [[withItems('fix', ['a']), leaf('rings')], 'mixed'],
      [[withItems('ad', ['a', 'b'], ['a'])], 'on'],
    ];

    // Act
    const results = rows.map(([leaves]) => rowStateOf(leaves, stateOf));

    // Assert
    expect(results).toEqual(rows.map(([, expected]) => expected));
  });
});

describe('rowStateOf beyond the navaid range', () => {
  it('keeps the NAVAIDS row on when the range hides the navaids', () => {
    // Arrange
    const stateOf = statesOf({ navaid: shownExcept() });
    const chart = [item('navaid', 'QDG')];
    // Precondition
    const drawnOutOfRange = drawnItemsOf(chart, ['navaid'], stateOf, () => false);

    // Act
    const row = rowStateOf([withItems('navaid', ['QDG'])], stateOf);

    // Assert
    expect(drawnOutOfRange).toEqual([]);
    expect(row).toBe('on');
  });
});

describe('groupCount', () => {
  it('counts the layers of which anything is shown, over the layers listed', () => {
    // Arrange
    const stateOf = statesOf({
      fix: hiddenExcept('a'),
      navaid: hiddenExcept(),
      coast: shownExcept(),
    });
    const leaves = [withItems('fix', ['a', 'b']), withItems('navaid', ['a']), leaf('coast')];

    // Act
    const count = groupCount(leaves, stateOf);

    // Assert
    expect(count).toEqual({ on: 2, all: 3 });
  });
});

describe('afterDot', () => {
  const present = ['a', 'b', 'c'];

  it('shows everything and clears the exceptions of a row that is not on', () => {
    // Arrange
    const stateOf = statesOf({ fix: hiddenExcept('a', 'gone'), coast: hiddenExcept() });
    const leaves = [withItems('fix', present), leaf('coast')];

    // Act
    const result = afterDot(leaves, stateOf, false);

    // Assert
    expect(result.map(([layer, next]) => [layer, plainState(next)])).toEqual([
      ['fix', { mode: true, exceptions: [] }],
      ['coast', { mode: true, exceptions: [] }],
    ]);
  });

  it('hides everything of a row that is on', () => {
    // Arrange
    const stateOf = statesOf({ fix: shownExcept() });
    const leaves = [withItems('fix', present)];

    // Act
    const result = afterDot(leaves, stateOf, false);

    // Assert
    expect(result.map(([layer, next]) => [layer, plainState(next)])).toEqual([
      ['fix', { mode: false, exceptions: [] }],
    ]);
  });

  it('while searching sets only the items listed and keeps the rest', () => {
    // Arrange
    const stateOf = statesOf({ fix: shownExcept('gone') });
    const leaves = [withItems('fix', present, ['a'])];

    // Act
    const result = afterDot(leaves, stateOf, true);

    // Assert
    expect(result.map(([layer, next]) => [layer, plainState(next)])).toEqual([
      ['fix', { mode: true, exceptions: ['gone', 'a'] }],
    ]);
  });

  it('while searching flips a layer whose items are all set the same way', () => {
    // Arrange
    const stateOf = statesOf({ fix: shownExcept() });
    const leaves = [withItems('fix', ['a', 'b'])];

    // Act
    const result = afterDot(leaves, stateOf, true);

    // Assert
    expect(result.map(([layer, next]) => [layer, plainState(next)])).toEqual([
      ['fix', { mode: false, exceptions: [] }],
    ]);
  });

  it('while searching sets the mode of a leaf layer', () => {
    // Arrange
    const stateOf = statesOf({ coast: shownExcept() });
    const leaves = [leaf('coast')];

    // Act
    const result = afterDot(leaves, stateOf, true);

    // Assert
    expect(result.map(([layer, next]) => [layer, plainState(next)])).toEqual([
      ['coast', { mode: false, exceptions: [] }],
    ]);
  });
});

describe('layerSummary', () => {
  const five = ['A', 'B', 'C', 'D', 'E'].map((name) => item('fix', name));

  it('says the count, the shown names, or shown over total, or that there is no data', () => {
    // Arrange
    const rows: [ScopeLayer, TreeItem[], LayerState, ReturnType<typeof layerSummary>][] = [
      ['fix', five, shownExcept(), { text: '5', tone: 'count' }],
      ['fix', five, hiddenExcept(), { text: '5', tone: 'count' }],
      ['fix', five, hiddenExcept('B'), { text: 'B', tone: 'subset' }],
      ['fix', five, hiddenExcept('B', 'D', 'E'), { text: 'B D E', tone: 'subset' }],
      ['fix', five, hiddenExcept('A', 'B', 'D', 'E'), { text: '4/5', tone: 'subset' }],
      ['fix', five, shownExcept('C'), { text: '4/5', tone: 'subset' }],
      ['fix', [], shownExcept(), { text: '—', tone: 'none' }],
      ['coast', [], shownExcept(), null],
      ['rings', [], hiddenExcept(), null],
    ];

    // Act
    const results = rows.map(([layer, items, layerState]) =>
      layerSummary(layer, items, layerState),
    );

    // Assert
    expect(results).toEqual(rows.map(([, , , expected]) => expected));
  });
});

describe('layerTitle', () => {
  it('names a layer in full with its AIP reference, and says when it has no data', () => {
    // Arrange
    const rows: [ScopeLayer, boolean, string][] = [
      ['fix', true, 'FIXES, AIP ENR 4.4'],
      ['fix', false, 'FIXES, AIP ENR 4.4, no data in the enabled sets'],
      ['sector', true, 'SECTORS'],
      ['sector', false, 'SECTORS, no data in the enabled sets'],
      ['advisory', true, 'ADVISORY AREAS, AIP ENR 2.2'],
      ['coast', false, 'COASTLINE'],
      ['rings', false, 'RANGE RINGS'],
    ];

    // Act
    const titles = rows.map(([layer, hasItems]) => layerTitle(layer, hasItems));

    // Assert
    expect(titles).toEqual(rows.map(([, , expected]) => expected));
  });
});

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
    const rows: [string, string[], string][] = [
      ['ZAMBU', [], 'ZAMBU'],
      ['', ['ZA'], ''],
      ['ZAMBU', ['ZA'], '[ZA]MBU'],
      ['Zambu', ['ZA'], '[Za]mbu'],
      ['ZAMBU2.KINRA', ['KIN'], 'ZAMBU2.[KIN]RA'],
      ['ZAMBU ZAMBU', ['ZA'], '[ZA]MBU [ZA]MBU'],
      ['ZAMBU', ['ZA', 'ZAMB'], '[ZAMB]U'],
      ['ZAMBU KIN', ['ZA', 'KI'], '[ZA]MBU [KI]N'],
      ['BAZAR', ['ZA'], 'BAZAR'],
    ];

    // Act
    const results = rows.map(([text, terms]) => marked(text, terms));

    // Assert
    expect(results).toEqual(rows.map(([, , pieces]) => pieces));
  });
});

const item = (layer: Layer, name: string, tag = ''): TreeItem => ({
  key: name,
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
