import { describe, expect, it } from 'bun:test';

import { box, line, partOf, polygon, project } from '../render/scene/chartFixture';
import { LineBatch } from '../render/scene/pack';
import { drawRuns, partsOf } from '../render/scene/runs';
import type { ProjectFn, Vec2 } from './geo';
import { geodesicLine } from './geodesic';
import type { LonLat } from './mapdata';
import { type PathLine, pathLines } from './pathLines';
import { pathSpans } from './routeSpans';
import { NO_CUTS } from './stops';
import { type ChartPath, topologyOf } from './topology';

/** A flat plane in NM, near enough to the earth that a long edge bows and is subdivided. */
const nm: ProjectFn = (lat, lon) => ({
  x: (lon * 60) / Math.cos((lat * Math.PI) / 180),
  y: lat * 60,
});

/** `plane`, and how many times it has been asked for a point. */
function counting(plane: ProjectFn) {
  const asked = { calls: 0 };
  const counted: ProjectFn = (lat, lon) => {
    asked.calls += 1;
    return plane(lat, lon);
  };
  return { asked, counted };
}

const routesThrough = (...paths: LonLat[][]): readonly ChartPath[] =>
  topologyOf(
    paths.map((at, i) => ({
      key: `R${i}`,
      layer: 'conv',
      parts: [partOf('conv', line(...at), { name: `R${i}` })],
    })),
  ).routes.paths;

const pointsOf = ({ points, at }: PathLine, from = 0, to = at.length - 1): Vec2[] => {
  const pairs: Vec2[] = [];
  for (let i = at[from] ?? 0; i <= (at[to] ?? 0); i += 2) {
    pairs.push({ x: points[i] ?? NaN, y: points[i + 1] ?? NaN });
  }
  return pairs;
};

const pathsOf = (paths: readonly ChartPath[]): [ChartPath, ChartPath] => {
  const [first, second] = paths;
  if (!first || !second) throw new Error('two paths expected');
  return [first, second];
};

describe('pathLines', () => {
  const longWay: LonLat[] = [
    [120, 30],
    [140, 45],
    [150, 20],
  ];

  it('walks a path as one array of the points its geodesic gives', () => {
    // Arrange
    const [path] = routesThrough(longWay);
    if (!path) throw new Error('no path');

    // Act
    const walked = pathLines(nm)(path);

    // Assert
    expect(pointsOf(walked)).toEqual(geodesicLine(longWay, nm));
    expect(pointsOf(walked).length).toBeGreaterThan(longWay.length);
  });

  it('marks where each vertex falls among the points', () => {
    // Arrange
    const [path] = routesThrough(longWay);
    if (!path) throw new Error('no path');

    // Act
    const walked = pathLines(nm)(path);

    // Assert
    expect(pointsOf(walked, 0, 1).at(-1)).toEqual(nm(45, 140));
    expect(pointsOf(walked, 1, 2)[0]).toEqual(nm(45, 140));
  });

  it('reaches each vertex by the length of the edges before it', () => {
    // Arrange
    const [path] = routesThrough([
      [0, 0],
      [3, 0],
      [3, 4],
    ]);
    if (!path) throw new Error('no path');

    // Act
    const walked = pathLines(project)(path);

    // Assert
    expect([...walked.reach]).toEqual([0, 3, 7]);
  });

  it('computes each edge once, however often its path is asked for', () => {
    // Arrange
    const [path] = routesThrough(longWay);
    if (!path) throw new Error('no path');
    const { asked, counted } = counting(nm);
    const lineOf = pathLines(counted);
    lineOf(path);
    const afterFirst = asked.calls;

    // Act
    const again = lineOf(path);

    // Assert
    expect(afterFirst).toBeGreaterThan(0);
    expect(asked.calls).toBe(afterFirst);
    expect(again).toBe(lineOf(path));
  });

  it('computes an edge again for another projection', () => {
    // Arrange
    const [path] = routesThrough(longWay);
    if (!path) throw new Error('no path');
    const { asked, counted } = counting(nm);
    pathLines(counted)(path);
    const afterFirst = asked.calls;

    // Act
    pathLines(counted)(path);

    // Assert
    expect(asked.calls).toBe(afterFirst * 2);
  });

  it('computes an edge shared by two paths once', () => {
    // Arrange
    const [first, second] = pathsOf(routesThrough(longWay, longWay.slice(0, 2)));
    const { asked, counted } = counting(nm);
    const lineOf = pathLines(counted);
    lineOf(first);
    const afterFirst = asked.calls;

    // Act
    const shared = lineOf(second);

    // Assert
    expect(asked.calls).toBe(afterFirst);
    expect(pointsOf(shared)).toEqual(pointsOf(lineOf(first), 0, 1));
  });

  it('reads a shared edge backwards for a path that runs it the other way', () => {
    // Arrange
    const [first, second] = pathsOf(routesThrough(longWay, longWay.toReversed()));
    const { asked, counted } = counting(nm);
    const lineOf = pathLines(counted);
    lineOf(first);
    const afterFirst = asked.calls;

    // Act
    const backwards = lineOf(second);

    // Assert
    expect(asked.calls).toBe(afterFirst);
    expect(pointsOf(backwards)).toEqual(pointsOf(lineOf(first)).toReversed());
  });

  it('computes the edges a later path adds, from where the shared ones end', () => {
    // Arrange
    const [first, second] = pathsOf(
      routesThrough(longWay.slice(0, 2), [...longWay.slice(0, 2), [160, 40]]),
    );
    const lineOf = pathLines(nm);
    lineOf(first);

    // Act
    const longer = lineOf(second);

    // Assert
    expect(pointsOf(longer)).toEqual(geodesicLine([...longWay.slice(0, 2), [160, 40]], nm));
  });

  it('keeps an edge a path runs twice, there and back', () => {
    // Arrange
    const [path] = routesThrough([
      [0, 0],
      [3, 0],
      [0, 0],
    ]);
    if (!path) throw new Error('no path');

    // Act
    const walked = pathLines(project)(path);

    // Assert
    expect(pointsOf(walked)).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect([...walked.reach]).toEqual([0, 3, 6]);
  });

  it('computes nothing for a second build with other items drawn and other stops', () => {
    // Arrange
    const chart = [longWay, longWay.toReversed(), longWay.slice(1)].map((at, i) => ({
      key: `R${i}`,
      layer: 'conv' as const,
      parts: [partOf('conv', line(...at), { name: `R${i}` })],
    }));
    const { routes } = topologyOf(chart);
    const { asked, counted } = counting(nm);
    const lineOf = pathLines(counted);
    const stop = new Map([[routes.paths[0]?.vertices[1] ?? -1, 5]]);
    drawRuns(routes, partsOf(chart), pathSpans(NO_CUTS, lineOf), new LineBatch());
    const afterFirst = asked.calls;

    // Act
    drawRuns(routes, partsOf(chart.slice(1)), pathSpans(stop, lineOf), new LineBatch());

    // Assert
    expect(afterFirst).toBeGreaterThan(0);
    expect(asked.calls).toBe(afterFirst);
  });

  it('computes nothing when one item is toggled', () => {
    // Arrange
    const chart = [box(0, 2), box(2, 4)].map((ring, i) => ({
      key: `T${i}`,
      layer: 'tma' as const,
      parts: [partOf('tma', polygon(ring))],
    }));
    const { areas } = topologyOf(chart);
    const { asked, counted } = counting(project);
    const spansOf = pathSpans(NO_CUTS, pathLines(counted));
    drawRuns(areas, partsOf(chart), spansOf, new LineBatch());
    const afterFirst = asked.calls;

    // Act
    drawRuns(areas, partsOf(chart.slice(1)), spansOf, new LineBatch());

    // Assert
    expect(afterFirst).toBeGreaterThan(0);
    expect(asked.calls).toBe(afterFirst);
  });

  it('walks a ring back to its first point', () => {
    // Arrange
    const ring = box(0, 2);
    const {
      areas: { paths },
    } = topologyOf([{ key: 'T', layer: 'tma', parts: [partOf('tma', polygon(ring))] }]);
    const [path] = paths;
    if (!path) throw new Error('no path');

    // Act
    const walked = pathLines(project)(path);

    // Assert
    expect(pointsOf(walked)).toEqual(ring.map(([x, y]) => ({ x, y })));
  });
});
