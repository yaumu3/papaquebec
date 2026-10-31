import { describe, expect, it } from 'bun:test';

import type { Chart, ItemPart } from './chart';
import type { LonLat } from './mapdata';
import type { Layer } from './mapsetFormat';
import { topologyOf } from './topology';

const A: LonLat = [130.6, 33.7];
const B: LonLat = [130.7, 33.7];
const C: LonLat = [130.7, 33.8];
const D: LonLat = [130.6, 33.8];

type Outline = LonLat[];
type LinearLayer = Exclude<Layer, 'ad' | 'navaid' | 'fix' | 'vfr' | 'hold'>;

function partOf(layer: LinearLayer, name: string, outlines: Outline[], lower?: string): ItemPart {
  const [first = []] = outlines;
  const geometry =
    outlines.length > 1
      ? { type: 'Polygon' as const, coordinates: outlines }
      : { type: 'LineString' as const, coordinates: first };
  const properties = { layer, name, ...(lower ? { lower } : {}) };
  return { geometry, properties };
}

const chartWith = (...parts: ItemPart[]): Chart =>
  parts.map((part, i) => ({ key: String(i), layer: part.properties.layer, parts: [part] }));

const nameOf = ({ properties }: ItemPart) => ('name' in properties ? properties.name : '');

const square: Outline = [A, B, C, D, A];

describe('topologyOf', () => {
  it('gives two vertices the same identity when they round to one 1e-5 degree grid point', () => {
    // Arrange
    const rows: [LonLat, LonLat, boolean][] = [
      [[130.6, 33.7], [130.600004, 33.7], true],
      [[130.6, 33.7], [130.60001, 33.7], false],
      [[130.6, 33.7], [130.6, 33.70001], false],
      [[-130.6, -33.7], [-130.600004, -33.700004], true],
      [[-0.000004, 0], [0.000004, 0], true],
    ];
    const far: LonLat = [131, 34];

    // Act
    const verdicts = rows.map(([p, q]) => {
      const { routes } = topologyOf(
        chartWith(partOf('conv', 'P', [[p, far]]), partOf('conv', 'Q', [[q, far]])),
      );
      return routes.paths[0]?.vertices[0] === routes.paths[1]?.vertices[0];
    });

    // Assert
    expect(verdicts).toEqual(rows.map(([, , same]) => same));
  });

  it('numbers an edge the same whichever way it is walked, and another edge otherwise', () => {
    // Arrange
    const chart = chartWith(
      partOf('conv', 'AB', [[A, B]]),
      partOf('conv', 'BA', [[B, A]]),
      partOf('conv', 'AC', [[A, C]]),
    );

    // Act
    const { routes } = topologyOf(chart);

    // Assert
    expect(routes.paths.map((path) => [...path.edges])).toEqual([[0], [0], [1]]);
    expect(routes.edgeCount).toBe(2);
  });

  it('merges neighbours at one identity, so a path has no empty edge', () => {
    // Arrange
    const nearA: LonLat = [130.600004, 33.7];
    const chart = chartWith(partOf('conv', 'R', [[A, nearA, B]]));

    // Act
    const { routes } = topologyOf(chart);

    // Assert
    expect(routes.paths[0]?.coordinates).toEqual([A, B]);
    expect(routes.paths[0]?.edges.length).toBe(1);
  });

  it('counts the edge that closes a ring, and one path per ring', () => {
    // Arrange
    const hole: Outline = [
      [130.62, 33.72],
      [130.64, 33.72],
      [130.64, 33.74],
      [130.62, 33.72],
    ];
    const chart = chartWith(partOf('tma', 'T', [square, hole]));

    // Act
    const { areas } = topologyOf(chart);

    // Assert
    expect(areas.paths.map((path) => path.edges.length)).toEqual([4, 3]);
    expect(areas.edgeCount).toBe(7);
  });

  it('makes a path of each area outline and each route, and none of a point or a hold', () => {
    // Arrange
    const point = (layer: 'ad' | 'fix'): ItemPart => ({
      geometry: { type: 'Point', coordinates: A },
      properties: { layer, id: 'X' },
    });
    const hold: ItemPart = {
      geometry: { type: 'Point', coordinates: A },
      properties: { layer: 'hold', turn: 'R', inboundMag: 90, inboundTrue: 90 },
    };
    const chart = chartWith(
      partOf('sector', 'S', [square, square]),
      partOf('asr', 'L', [[A, B, C]]),
      partOf('conv', 'R', [[A, B]]),
      point('fix'),
      hold,
      point('ad'),
    );

    // Act
    const { areas, routes } = topologyOf(chart);

    // Assert
    expect([areas.paths.length, routes.paths.length]).toEqual([3, 1]);
  });

  it('sorts paths front first, a lower stratum before an upper, then in chart order', () => {
    // Arrange
    const chart = chartWith(
      partOf('fir', 'fir', [square]),
      partOf('sector', 'upper', [square], 'FL195'),
      partOf('tma', 'tma1', [square]),
      partOf('sector', 'lower', [square]),
      partOf('tma', 'tma2', [square]),
    );

    // Act
    const { areas } = topologyOf(chart);

    // Assert
    expect(areas.paths.map((path) => nameOf(path.part))).toEqual([
      'tma1',
      'tma2',
      'lower',
      'upper',
      'fir',
    ]);
  });

  it('numbers occurrences along the sorted paths', () => {
    // Arrange
    const chart = chartWith(partOf('fir', 'F', [[A, B, C]]), partOf('tma', 'T', [square]));

    // Act
    const { areas } = topologyOf(chart);

    // Assert
    expect(areas.paths.map((path) => path.firstOccurrence)).toEqual([0, 4]);
  });

  it('keeps an area and a route on one line in networks of their own', () => {
    // Arrange
    const chart = chartWith(partOf('sector', 'S', [[A, B]]), partOf('conv', 'R', [[A, B]]));

    // Act
    const { areas, routes } = topologyOf(chart);

    // Assert
    expect([areas.edgeCount, routes.edgeCount]).toEqual([1, 1]);
    expect([...(areas.paths[0]?.edges ?? [])]).toEqual([0]);
    expect([...(routes.paths[0]?.edges ?? [])]).toEqual([0]);
  });
});
