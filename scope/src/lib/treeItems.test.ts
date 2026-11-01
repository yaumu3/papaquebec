import { describe, expect, it } from 'bun:test';

import { chartOf } from './chart';
import type { ScopeLayer } from './layers';
import { type MapSetData, validateMapSet } from './mapset';
import { topologyOf } from './topology';
import { itemsIn, treeItemsOf } from './treeItems';

type Position = [number, number];

const HERE: Position = [130.6, 33.7];
const RING: Position[] = [HERE, [130.7, 33.7], [130.7, 33.8], HERE];

const feat = (properties: object, geometry: object) => ({ type: 'Feature', properties, geometry });
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
