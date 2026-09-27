import { describe, expect, it } from 'bun:test';

import { inverse } from '../../lib/geodesic';
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

describe('buildMap airspace', () => {
  it('draws a circular airspace as the geodesic circle of its radius', () => {
    // Arrange
    const center = { lat: 35.5, lon: 139.8 };
    const circle = {
      name: 'CTR',
      center: [center.lat, center.lon] as [number, number],
      radiusNm: 5,
    };
    const input = mapInput({ aero: { ...aero, airspace: [circle] } });

    // Act
    const { airspace } = buildMap(input);

    // Assert
    const lines = airspace.find((b) => b.kind === 'lines');
    const starts = Array.from({ length: lines?.count ?? 0 }, (_, i) => ({
      lon: lines?.data[i * 16] ?? 0,
      lat: lines?.data[i * 16 + 1] ?? 0,
    }));
    expect(starts.length).toBeGreaterThan(0);
    // Within what Float32 instance data holds of a longitude near 140°, about half a metre.
    expect(starts.every((p) => Math.abs(inverse(center, p).distanceNm - 5) < 1e-3)).toBe(true);
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
