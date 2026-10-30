import { describe, expect, it } from 'bun:test';

import type { DrawnLayers } from '../../lib/mapdata';
import type { Layers } from '../../state/settingsDefaults';
import { MAP_LAYERS } from '../layers';
import type { Batch } from '../protocol';
import { atlas } from './atlasFixture';
import { buildMap, buildRings, type MapInput, navaidsShownAt } from './static';

const allLayers: Layers = {
  coast: true,
  airspace: true,
  waypoints: true,
  airways: true,
  navaids: true,
  rings: true,
  sector: true,
  airports: true,
};

const drawn: DrawnLayers = {
  waypoints: [],
  navaids: [{ id: 'HME', lat: 35.5, lon: 139.8 }],
  airways: [],
  airspace: [],
  sectors: [],
  airports: [],
};

function mapInput(over: Partial<MapInput> = {}): MapInput {
  return {
    coast: { lines: [] },
    drawn,
    project: (lat, lon) => ({ x: lon, y: lat }),
    layers: allLayers,
    labelDensity: 'normal',
    navaidsInRange: true,
    atlas,
    ...over,
  };
}

/** A stand-in ring outline of two segments, its first point north at `(1, r)`. */
const ringPath = (r: number) => [
  { x: 1, y: r },
  { x: r, y: 0 },
  { x: 1, y: r },
];

const count = (batches: Batch[], kind: Batch['kind']) =>
  batches.filter((b) => b.kind === kind).reduce((n, b) => n + b.count, 0);

describe('buildRings', () => {
  it('draws each ring along its path, with the radius printed at its first, northern point', () => {
    // Arrange
    const input = { layers: allLayers, rangeNm: 40, ringExtentNm: 40, ringPath, atlas };

    // Act
    const batches = buildRings(input);

    // Assert
    const text = batches.find((b) => b.kind === 'text');
    expect(count(batches, 'lines')).toBe(4 * 2);
    expect(count(batches, 'text')).toBe('10203040'.length);
    expect([text?.data[0], text?.data[1]]).toEqual([1, 10]);
  });
});

describe('buildMap', () => {
  it('builds every map layer', () => {
    // Arrange
    const input = mapInput();

    // Act
    const layers = buildMap(input);

    // Assert
    expect(Object.keys(layers).toSorted()).toEqual([...MAP_LAYERS].toSorted());
  });

  it('draws navaids only while the range keeps them in view', () => {
    // Arrange
    const cases = [true, false];

    // Act
    const counts = cases.map((navaidsInRange) => {
      const { fixes } = buildMap(mapInput({ navaidsInRange }));
      return count(fixes, 'markers');
    });

    // Assert
    expect(counts).toEqual([1, 0]);
  });
});

describe('buildMap airspace', () => {
  it('draws an area as one line per closed segment', () => {
    // Arrange
    const area = {
      name: 'PAPAQ',
      kind: 'CTR',
      points: [
        [35.5, 139.8],
        [35.6, 139.8],
        [35.6, 139.9],
      ] as [number, number][],
      dashed: true,
    };
    const input = mapInput({ drawn: { ...drawn, airspace: [area] } });

    // Act
    const { airspace } = buildMap(input);

    // Assert
    expect(count(airspace, 'lines')).toBe(3);
  });
});

describe('buildMap edges', () => {
  it('splits long sector and coast edges along the geodesic, closing the outline', () => {
    // Arrange
    const outline: [number, number][] = [
      [35, 130],
      [35, 150],
      [40, 140],
    ];
    const input = mapInput({
      drawn: { ...drawn, sectors: [{ name: 'S', points: outline }] },
      coast: { lines: [outline.map(([lat, lon]) => [lon, lat] as [number, number])] },
    });

    // Act
    const { sector, coast } = buildMap(input);

    // Assert
    expect(count(sector, 'lines')).toBeGreaterThan(3);
    expect(count(coast, 'lines')).toBeGreaterThan(2);
  });
});

describe('navaidsShownAt', () => {
  it('shows navaids out to 120 NM and hides them beyond', () => {
    // Arrange
    const ranges = [120, 121];

    // Act
    const shown = ranges.map(navaidsShownAt);

    // Assert
    expect(shown).toEqual([true, false]);
  });
});
