import { describe, expect, it } from 'bun:test';

import { line, partOf, project } from '../render/scene/chartFixture';
import type { ProjectFn } from './geo';
import { geodesicLine } from './geodesic';
import { pathSpans } from './routeSpans';
import { NO_CUTS } from './stops';
import { type ChartPath, topologyOf } from './topology';

/** A flat plane in NM, near enough to the earth that a long edge bows and is subdivided. */
const nm: ProjectFn = (lat, lon) => ({
  x: (lon * 60) / Math.cos((lat * Math.PI) / 180),
  y: lat * 60,
});

const pathThrough = (...at: [number, number][]): ChartPath => {
  const { routes } = topologyOf([
    { key: 'A1', layer: 'conv', parts: [partOf('conv', line(...at), { name: 'A1' })] },
  ]);
  const [path] = routes.paths;
  if (!path) throw new Error('no path');
  return path;
};

/** The edges of a span as one polyline. */
const joined = (edges: readonly (readonly { x: number; y: number }[])[]) =>
  edges.flatMap((edge, i) => (i === 0 ? edge : edge.slice(1)));

describe('pathSpans', () => {
  it('gives each edge the points one geodesic over the span gives it', () => {
    // Arrange
    const at: [number, number][] = [
      [120, 30],
      [140, 45],
      [150, 20],
    ];
    const path = pathThrough(...at);

    // Act
    const [span] = pathSpans(NO_CUTS, nm)(path);

    // Assert
    expect(joined(span?.edges ?? [])).toEqual(geodesicLine(at, nm));
    expect(span?.edges.length).toBe(2);
  });

  it('reaches each vertex by the length of the edges before it', () => {
    // Arrange
    const path = pathThrough([0, 0], [3, 0], [3, 4]);

    // Act
    const [span] = pathSpans(NO_CUTS, project)(path);

    // Assert
    expect(span?.reach).toEqual([0, 3, 7]);
    expect(span?.length).toBe(7);
  });

  it('splits a path at its stops, each span with its own cuts and reach', () => {
    // Arrange
    const path = pathThrough([0, 0], [3, 0], [3, 4]);
    const cuts = new Map([[path.vertices[1] ?? -1, 7]]);

    // Act
    const spans = pathSpans(cuts, project)(path);

    // Assert
    expect(spans.map((s) => [s.from, s.to, s.cutBack, s.cutAhead, s.length])).toEqual([
      [0, 1, 0, 7, 3],
      [1, 2, 7, 0, 4],
    ]);
  });

  it('finds the midpoint and how the span reads, turned upright when it runs backwards', () => {
    // Arrange
    const forwards = pathThrough([0, 0], [2, 0]);
    const backwards = pathThrough([2, 0], [0, 0]);

    // Act
    const spans = [forwards, backwards].map((path) => pathSpans(NO_CUTS, project)(path)[0]);

    // Assert
    expect(spans.map((s) => [s?.middle?.at, s?.middle?.flipped])).toEqual([
      [{ x: 1, y: 0 }, false],
      [{ x: 1, y: 0 }, true],
    ]);
  });

  it('gives the one span of two directions one identity', () => {
    // Arrange
    const forwards = pathThrough([0, 0], [2, 0]);
    const backwards = pathThrough([2, 0], [0, 0]);

    // Act
    const ids = [forwards, backwards].map((path) => pathSpans(NO_CUTS, project)(path)[0]?.id);

    // Assert
    expect(ids[0]).toBe(ids[1] ?? '');
  });

  it('walks a path once however often it is asked', () => {
    // Arrange
    const path = pathThrough([0, 0], [2, 0]);
    const spansOf = pathSpans(NO_CUTS, project);

    // Act
    const [first, second] = [spansOf(path), spansOf(path)];

    // Assert
    expect(second).toBe(first);
  });
});
