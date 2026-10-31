import { describe, expect, it } from 'bun:test';

import type { Chart } from './chart';
import type { LonLat } from './mapdata';
import type { PointLayer } from './mapsetFormat';
import { type Cuts, NO_CUTS, spansOf, STOP_CLEARANCE_PX, stopCuts } from './stops';
import { type ChartPoint, topologyOf } from './topology';

const SIZES: Record<PointLayer, number> = { ad: 9, navaid: 10, fix: 8, vfr: 6 };
const sizeOf = (layer: PointLayer) => SIZES[layer];

const point = (layer: PointLayer, vertex: number): ChartPoint => ({
  layer,
  id: 'Q',
  at: [0, 0],
  vertex,
});

describe('stopCuts', () => {
  it('cuts half the marker plus the clearance, and the largest where points share a vertex', () => {
    // Arrange
    const points = [
      point('fix', 1),
      point('navaid', 2),
      point('vfr', 3),
      point('vfr', 4),
      point('navaid', 4),
      point('navaid', 5),
      point('vfr', 5),
    ];

    // Act
    const cuts = stopCuts(points, sizeOf);

    // Assert
    expect(Object.fromEntries(cuts)).toEqual({
      1: 4 + STOP_CLEARANCE_PX,
      2: 5 + STOP_CLEARANCE_PX,
      3: 3 + STOP_CLEARANCE_PX,
      4: 5 + STOP_CLEARANCE_PX,
      5: 5 + STOP_CLEARANCE_PX,
    });
  });

  it('cuts nothing when there are no points', () => {
    // Arrange
    const points: ChartPoint[] = [];

    // Act
    const cuts = stopCuts(points, sizeOf);

    // Assert
    expect(cuts.size).toBe(0);
  });
});

const line: LonLat[] = [
  [130.1, 33.7],
  [130.2, 33.7],
  [130.3, 33.7],
  [130.4, 33.7],
  [130.5, 33.7],
];

const routeOf = (coordinates: LonLat[]): Chart => [
  {
    key: 'R',
    layer: 'conv',
    parts: [
      {
        geometry: { type: 'LineString', coordinates },
        properties: { layer: 'conv', name: 'R' },
      },
    ],
  },
];

const span = (from: number, to: number, cutBack: number, cutAhead: number) => ({
  from,
  to,
  cutBack,
  cutAhead,
});

describe('spansOf', () => {
  it('splits a route at its stops, and gives a stop at an end to the span there', () => {
    // Arrange
    const { routes } = topologyOf(routeOf(line));
    const [path] = routes.paths;
    const cutsAt = (...stops: [number, number][]): Cuts =>
      new Map(stops.map(([i, cut]) => [path?.vertices[i] ?? -1, cut]));
    const rows: [string, Cuts, ReturnType<typeof span>[]][] = [
      ['no stop', NO_CUTS, [span(0, 4, 0, 0)]],
      ['a stop inside', cutsAt([2, 7]), [span(0, 2, 0, 7), span(2, 4, 7, 0)]],
      ['a stop at the start', cutsAt([0, 7]), [span(0, 4, 7, 0)]],
      ['a stop at the end', cutsAt([4, 7]), [span(0, 4, 0, 7)]],
      ['stops at both ends', cutsAt([0, 7], [4, 8]), [span(0, 4, 7, 8)]],
      [
        'two neighbouring stops',
        cutsAt([1, 7], [2, 8]),
        [span(0, 1, 0, 7), span(1, 2, 7, 8), span(2, 4, 8, 0)],
      ],
      ['a point off the route', new Map([[10_000, 7]]), [span(0, 4, 0, 0)]],
    ];

    // Act
    const spans = rows.map(([, cuts]) => (path ? spansOf(path, cuts) : []));

    // Assert
    expect(spans).toEqual(rows.map(([, , expected]) => expected));
  });

  it('gives a path with no edges no span', () => {
    // Arrange
    const { routes } = topologyOf(
      routeOf([
        [130.1, 33.7],
        [130.100004, 33.7],
      ]),
    );
    const [path] = routes.paths;

    // Act
    const spans = path ? spansOf(path, NO_CUTS) : null;

    // Assert
    expect(spans).toEqual([]);
  });
});
