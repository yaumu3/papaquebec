import { describe, expect, it } from 'bun:test';

import type { AeroLayers } from '../../lib/mapdata';
import { MAP_PRESETS } from '../../state/settingsDefaults';
import type { Batch } from '../protocol';
import { atlas } from './atlasFixture';
import { buildMap, buildRings, MAP_ORDER, type MapInput, navaidsShownAt } from './static';

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

const count = (batches: Batch[], kind: Batch['kind']) =>
  batches.filter((b) => b.kind === kind).reduce((n, b) => n + b.count, 0);

describe('buildRings', () => {
  it('draws the rings alone, with each radius printed on it', () => {
    // Arrange
    const input = { layers: allLayers, rangeNm: 40, ringExtentNm: 40, atlas };

    // Act
    const layer = buildRings(input);

    // Assert
    expect(layer.name).toBe('rings');
    expect(count(layer.batches, 'text')).toBe('10203040'.length);
  });
});

describe('buildMap', () => {
  it('builds every map layer but the rings, back to front', () => {
    // Arrange
    const input = mapInput();

    // Act
    const layers = buildMap(input);

    // Assert
    expect(layers.map((l) => l.name)).toEqual([...MAP_ORDER]);
    expect(MAP_ORDER).not.toContain('rings');
  });

  it('draws navaids only while the range keeps them in view', () => {
    // Arrange
    const cases = [true, false];

    // Act
    const drawn = cases.map((navaidsInRange) => {
      const fixes = buildMap(mapInput({ navaidsInRange })).find((l) => l.name === 'fixes');
      return count(fixes?.batches ?? [], 'markers');
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
