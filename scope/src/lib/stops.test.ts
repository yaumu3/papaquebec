import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import type { Position } from '../render/scene/chartFixture';
import { airway } from '../render/scene/chartFixture';
import type { PointLayer } from './mapsetFormat';
import { type Cuts, NO_CUTS, spanIdentity, spansOf, STOP_CLEARANCE_PX, stopCuts } from './stops';
import { type ChartPoint, topologyOf } from './topology';

const SIZES: Record<PointLayer, number> = { ad: 9, navaid: 10, fix: 8, vfr: 6 };
const sizeOf = (layer: PointLayer) => SIZES[layer];

const point = (layer: PointLayer, vertex: number): ChartPoint => ({
  key: 'Q',
  layer,
  id: 'Q',
  kind: undefined,
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

/** Positions a grid cell or more apart along a parallel, as many as asked for. */
const lineOf = (length: number): Position[] =>
  Array.from({ length }, (_, i) => [130.1 + i / 10, 33.7]);

const routeOf = (coordinates: Position[]) => [airway('conv', 'R', ...coordinates)];

describe('spansOf', () => {
  it('splits a route at its stops, and gives a stop at an end to the span there', () => {
    // Arrange: stops at any of the route's positions, and one off the route
    const anyRoute = fc.integer({ min: 2, max: 8 }).chain((length) =>
      fc.record({
        length: fc.constant(length),
        stops: fc.uniqueArray(
          fc.tuple(fc.nat({ max: length - 1 }), fc.integer({ min: 1, max: 9 })),
          { selector: ([i]) => i },
        ),
      }),
    );

    fc.assert(
      fc.property(anyRoute, ({ length, stops }) => {
        // Arrange
        const [path] = topologyOf(routeOf(lineOf(length))).routes.paths;
        if (!path) throw new Error('no path');
        const cutAt = new Map(stops);
        const cuts: Cuts = new Map([
          ...stops.map(([i, cut]): [number, number] => [path.vertices[i] ?? -1, cut]),
          [10_000, 7],
        ]);

        // Act
        const spans = spansOf(path, cuts);

        // Assert
        const inside = stops.map(([i]) => i).filter((i) => i > 0 && i < length - 1);
        expect(spans.map((s) => s.from)).toEqual([0, ...inside.toSorted((a, b) => a - b)]);
        expect(spans.map((s) => s.to)).toEqual([...spans.slice(1).map((s) => s.from), length - 1]);
        expect(spans.map((s) => [s.cutBack, s.cutAhead])).toEqual(
          spans.map((s) => [cutAt.get(s.from) ?? 0, cutAt.get(s.to) ?? 0]),
        );
      }),
    );
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

describe('spanIdentity', () => {
  it('names a span by its positions in either direction, and tells partial overlaps apart', () => {
    // Arrange
    const anyLength = fc.integer({ min: 3, max: 8 });

    fc.assert(
      fc.property(anyLength, (length) => {
        // Arrange
        const there = lineOf(length);
        const swapped = [...there.slice(0, -2), ...there.slice(-2).toReversed()];
        const routes = [there, there.toReversed(), there.slice(0, -1), swapped, there];
        const chart = routes.map((coordinates, i) => airway('conv', `R${i}`, ...coordinates));
        const { paths } = topologyOf(chart).routes;
        const whole = (i: number) => ({ from: 0, to: (paths[i]?.vertices.length ?? 1) - 1 });

        // Act
        const [plain, back, shorter, reordered, again] = paths.map((path, i) =>
          spanIdentity(path, whole(i)),
        );

        // Assert
        expect([back, again]).toEqual([plain, plain]);
        expect(shorter).not.toBe(plain);
        expect(reordered).not.toBe(plain);
      }),
    );
  });
});
