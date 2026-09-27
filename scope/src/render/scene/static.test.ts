import { describe, expect, it } from 'bun:test';

import type { AeroLayers } from '../../lib/mapdata';
import { MAP_PRESETS } from '../../state/settingsDefaults';
import { MAP_LAYERS } from '../layers';
import type { Batch } from '../protocol';
import { atlas } from './atlasFixture';
import { buildMap, buildRings, type MapInput, navaidsShownAt } from './static';

const allLayers = MAP_PRESETS.all;

const aero: AeroLayers = {
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
    aero,
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
    const drawn = cases.map((navaidsInRange) => {
      const { fixes } = buildMap(mapInput({ navaidsInRange }));
      return count(fixes, 'markers');
    });

    // Assert
    expect(drawn).toEqual([1, 0]);
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
