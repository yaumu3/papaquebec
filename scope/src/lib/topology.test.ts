import { describe, expect, it } from 'bun:test';

import type { Chart, ItemPart } from './chart';
import type { LonLat } from './mapdata';
import type { Layer } from './mapsetFormat';
import { ownersOf, runsOf, type Stretch, type Network, topologyOf } from './topology';

const A: LonLat = [130.6, 33.7];
const B: LonLat = [130.7, 33.7];
const C: LonLat = [130.7, 33.8];
const D: LonLat = [130.6, 33.8];

type Outline = LonLat[];
type LinearLayer = Exclude<Layer, 'ad' | 'navaid' | 'fix' | 'vfr' | 'hold'>;

interface Extra {
  lower?: string;
  kind?: string;
}

function partOf(
  layer: LinearLayer,
  name: string,
  outlines: Outline[],
  extra: Extra = {},
): ItemPart {
  const [first = []] = outlines;
  const geometry =
    outlines.length > 1
      ? { type: 'Polygon' as const, coordinates: outlines }
      : { type: 'LineString' as const, coordinates: first };
  const properties = { layer, name, ...extra };
  return { geometry, properties };
}

const chartWith = (...parts: ItemPart[]): Chart =>
  parts.map((part, i) => ({ key: String(i), layer: part.properties.layer, parts: [part] }));

const nameOf = ({ properties }: ItemPart) => ('name' in properties ? (properties.name ?? '') : '');

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
      partOf('sector', 'upper', [square], { lower: 'FL195' }),
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

const run = (from: number, to: number): Stretch => ({ from, to });

const E: LonLat = [130.8, 33.7];
const F: LonLat = [130.8, 33.8];

/** The runs each named part draws, its paths in order, when only the parts not hidden draw. */
function runsDrawn(network: Network, hidden: string[] = []): Record<string, Stretch[]> {
  const drawn = new Set(
    network.paths.map((p) => p.part).filter((p) => !hidden.includes(nameOf(p))),
  );
  const owners = ownersOf(network, drawn);
  return Object.fromEntries(network.paths.map((path) => [nameOf(path.part), runsOf(path, owners)]));
}

describe('ownersOf', () => {
  it('names the occurrence that draws each edge, and -1 where no drawn part has it', () => {
    // Arrange
    const { areas } = topologyOf(
      chartWith(partOf('tma', 'T', [[A, B, C]]), partOf('fir', 'F', [[A, B, D]])),
    );
    const everything = new Set(areas.paths.map((p) => p.part));
    const onlyFir = new Set(areas.paths.slice(1).map((p) => p.part));

    // Act
    const owners = [everything, onlyFir].map((drawn) => Array.from(ownersOf(areas, drawn)));

    // Assert
    expect(owners).toEqual([
      [0, 1, 3],
      [2, -1, 3],
    ]);
  });
});

describe('runsOf', () => {
  it('draws a shared edge once, by the rule that picks its owner', () => {
    // Arrange
    const rows: [string, Chart, string[], Record<string, Stretch[]>][] = [
      [
        'front layer over a layer behind',
        chartWith(partOf('fir', 'fir', [[A, B, D]]), partOf('tma', 'tma', [[A, B, C]])),
        [],
        { tma: [run(0, 2)], fir: [run(1, 2)] },
      ],
      [
        'the front layer hidden hands the edge down',
        chartWith(partOf('fir', 'fir', [[A, B, D]]), partOf('tma', 'tma', [[A, B, C]])),
        ['tma'],
        { tma: [], fir: [run(0, 2)] },
      ],
      [
        'a lower stratum over an upper one that comes first',
        chartWith(
          partOf('sector', 'upper', [[A, B, C]], { lower: 'FL195' }),
          partOf('sector', 'lower', [[A, B, D]]),
        ),
        [],
        { lower: [run(0, 2)], upper: [run(1, 2)] },
      ],
      [
        'the first in chart order among equals, whatever their kinds',
        chartWith(
          partOf('tma', 'first', [[A, B, C]], { kind: 'X' }),
          partOf('tma', 'second', [[A, B, D]], { kind: 'Y' }),
        ),
        [],
        { first: [run(0, 2)], second: [run(1, 2)] },
      ],
      [
        'a path that retraces an edge draws it once',
        chartWith(partOf('asr', 'R', [[A, B, A, C]])),
        [],
        { R: [run(0, 1), run(2, 3)] },
      ],
      [
        'an edge shared mid-path splits the path into two runs',
        chartWith(partOf('fir', 'long', [[A, B, C, D, E]]), partOf('tma', 'short', [[B, C]])),
        [],
        { short: [run(0, 1)], long: [run(0, 1), run(2, 4)] },
      ],
      [
        'a run does not wrap across the start of a ring',
        chartWith(partOf('fir', 'ring', [square]), partOf('tma', 'side', [[C, D]])),
        [],
        { side: [run(0, 1)], ring: [run(0, 2), run(3, 4)] },
      ],
    ];

    // Act
    const results = rows.map(([, chart, hidden]) => runsDrawn(topologyOf(chart).areas, hidden));

    // Assert
    expect(results).toEqual(rows.map(([, , , expected]) => expected));
  });

  it('draws the edge two parts of one item share once', () => {
    // Arrange
    const step = partOf('tma', 'step', [[B, E, F, C, B]]);
    const base = partOf('tma', 'base', [square]);
    const chart: Chart = [{ key: 'T', layer: 'tma', parts: [base, step] }];

    // Act
    const runs = runsDrawn(topologyOf(chart).areas);

    // Assert
    expect(runs).toEqual({ base: [run(0, 4)], step: [run(0, 3)] });
  });

  it('keeps a run inside the stretch it is asked for', () => {
    // Arrange
    const { routes } = topologyOf(chartWith(partOf('conv', 'R', [[A, B, C, D, E]])));
    const [path] = routes.paths;
    const owners = ownersOf(routes, new Set(routes.paths.map((p) => p.part)));

    // Act
    const runs = path && runsOf(path, owners, run(1, 3));

    // Assert
    expect(runs).toEqual([run(1, 3)]);
  });
});
