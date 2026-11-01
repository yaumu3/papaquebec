import { describe, expect, it } from 'bun:test';

import { chartWith, itemOf, line, partOf, point, polygon } from '../render/scene/chartFixture';
import type { Chart, ItemPart } from './chart';
import type { LonLat } from './mapdata';
import type { Layer } from './mapsetFormat';
import {
  drawnPointsOf,
  ownersOf,
  runsOf,
  type Stretch,
  type ChartPath,
  type Network,
  topologyOf,
} from './topology';
import { drawnItemsOf } from './visibility';
import { allShown } from './visibilityFixture';

const A: LonLat = [130.6, 33.7];
const B: LonLat = [130.7, 33.7];
const C: LonLat = [130.7, 33.8];
const D: LonLat = [130.6, 33.8];

type Outline = LonLat[];

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
        chartWith(
          partOf('conv', line(p, far), { name: 'P' }),
          partOf('conv', line(q, far), { name: 'Q' }),
        ),
      );
      return routes.paths[0]?.vertices[0] === routes.paths[1]?.vertices[0];
    });

    // Assert
    expect(verdicts).toEqual(rows.map(([, , same]) => same));
  });

  it('numbers an edge the same whichever way it is walked, and another edge otherwise', () => {
    // Arrange
    const chart = chartWith(
      partOf('conv', line(A, B), { name: 'AB' }),
      partOf('conv', line(B, A), { name: 'BA' }),
      partOf('conv', line(A, C), { name: 'AC' }),
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
    const chart = chartWith(partOf('conv', line(A, nearA, B), { name: 'R' }));

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
    const chart = chartWith(partOf('tma', polygon(square, hole), { name: 'T' }));

    // Act
    const { areas } = topologyOf(chart);

    // Assert
    expect(areas.paths.map((path) => path.edges.length)).toEqual([4, 3]);
    expect(areas.edgeCount).toBe(7);
  });

  it('makes a path of each area outline and each route, and none of a point or a hold', () => {
    // Arrange
    const hold = partOf('hold', point(A), { inboundMag: 90, inboundTrue: 90 });
    const chart = chartWith(
      partOf('sector', polygon(square, square), { name: 'S' }),
      partOf('asr', line(A, B, C), { name: 'L' }),
      partOf('conv', line(A, B), { name: 'R' }),
      partOf('fix', point(A), { id: 'X' }),
      hold,
      partOf('ad', point(A), { id: 'X' }),
    );

    // Act
    const { areas, routes } = topologyOf(chart);

    // Assert
    expect([areas.paths.length, routes.paths.length]).toEqual([3, 1]);
  });

  it('sorts paths front first, a lower stratum before an upper, then in chart order', () => {
    // Arrange
    const chart = chartWith(
      partOf('fir', line(...square), { name: 'fir' }),
      partOf('sector', line(...square), { name: 'upper', lower: 'FL195' }),
      partOf('tma', line(...square), { name: 'tma1' }),
      partOf('sector', line(...square), { name: 'lower' }),
      partOf('tma', line(...square), { name: 'tma2' }),
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
    const chart = chartWith(
      partOf('fir', line(A, B, C), { name: 'F' }),
      partOf('tma', line(...square), { name: 'T' }),
    );

    // Act
    const { areas } = topologyOf(chart);

    // Assert
    expect(areas.paths.map((path) => path.firstOccurrence)).toEqual([0, 4]);
  });

  it('keeps an area and a route on one line in networks of their own', () => {
    // Arrange
    const chart = chartWith(
      partOf('sector', line(A, B), { name: 'S' }),
      partOf('conv', line(A, B), { name: 'R' }),
    );

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

const whole = (path: ChartPath): Stretch => ({ from: 0, to: path.edges.length });

/** The runs each named part draws, its paths in order, when only the parts not hidden draw. */
function runsDrawn(network: Network, hidden: string[] = []): Record<string, Stretch[]> {
  const drawn = new Set(
    network.paths.map((p) => p.part).filter((p) => !hidden.includes(nameOf(p))),
  );
  const owners = ownersOf(network, drawn);
  return Object.fromEntries(
    network.paths.map((path) => [nameOf(path.part), runsOf(path, owners, whole(path))]),
  );
}

describe('ownersOf', () => {
  it('names the occurrence that draws each edge, and -1 where no drawn part has it', () => {
    // Arrange
    const { areas } = topologyOf(
      chartWith(
        partOf('tma', line(A, B, C), { name: 'T' }),
        partOf('fir', line(A, B, D), { name: 'F' }),
      ),
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
        chartWith(
          partOf('fir', line(A, B, D), { name: 'fir' }),
          partOf('tma', line(A, B, C), { name: 'tma' }),
        ),
        [],
        { tma: [run(0, 2)], fir: [run(1, 2)] },
      ],
      [
        'the front layer hidden hands the edge down',
        chartWith(
          partOf('fir', line(A, B, D), { name: 'fir' }),
          partOf('tma', line(A, B, C), { name: 'tma' }),
        ),
        ['tma'],
        { tma: [], fir: [run(0, 2)] },
      ],
      [
        'a lower stratum over an upper one that comes first',
        chartWith(
          partOf('sector', line(A, B, C), { name: 'upper', lower: 'FL195' }),
          partOf('sector', line(A, B, D), { name: 'lower' }),
        ),
        [],
        { lower: [run(0, 2)], upper: [run(1, 2)] },
      ],
      [
        'the first in chart order among equals, whatever their kinds',
        chartWith(
          partOf('tma', line(A, B, C), { name: 'first', kind: 'X' }),
          partOf('tma', line(A, B, D), { name: 'second', kind: 'Y' }),
        ),
        [],
        { first: [run(0, 2)], second: [run(1, 2)] },
      ],
      [
        'a path that retraces an edge draws it once',
        chartWith(partOf('asr', line(A, B, A, C), { name: 'R' })),
        [],
        { R: [run(0, 1), run(2, 3)] },
      ],
      [
        'an edge shared mid-path splits the path into two runs',
        chartWith(
          partOf('fir', line(A, B, C, D, E), { name: 'long' }),
          partOf('tma', line(B, C), { name: 'short' }),
        ),
        [],
        { short: [run(0, 1)], long: [run(0, 1), run(2, 4)] },
      ],
      [
        'a run does not wrap across the start of a ring',
        chartWith(
          partOf('fir', line(...square), { name: 'ring' }),
          partOf('tma', line(C, D), { name: 'side' }),
        ),
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
    const step = partOf('tma', line(B, E, F, C, B), { name: 'step' });
    const base = partOf('tma', line(...square), { name: 'base' });
    const chart: Chart = [{ key: 'T', layer: 'tma', parts: [base, step] }];

    // Act
    const runs = runsDrawn(topologyOf(chart).areas);

    // Assert
    expect(runs).toEqual({ base: [run(0, 4)], step: [run(0, 3)] });
  });

  it('keeps a run inside the stretch it is asked for', () => {
    // Arrange
    const { routes } = topologyOf(chartWith(partOf('conv', line(A, B, C, D, E), { name: 'R' })));
    const [path] = routes.paths;
    const owners = ownersOf(routes, new Set(routes.paths.map((p) => p.part)));

    // Act
    const runs = path && runsOf(path, owners, run(1, 3));

    // Assert
    expect(runs).toEqual([run(1, 3)]);
  });
});

describe('the points of a topology', () => {
  const chart: Chart = [
    itemOf('fix', partOf('fix', point(A), { id: 'TAVRO' })),
    itemOf(
      'vfr',
      partOf('vfr', point(B), { id: 'CAUSE' }),
      partOf('vfr', point(E), { id: 'CAUSE' }),
    ),
    itemOf('navaid', partOf('navaid', point(C), { id: 'QDG' })),
    itemOf('ad', partOf('ad', point(D), { id: 'QAAA' })),
  ];

  it('lists a point for each part of a point item, in chart order, and none for a hold or a line', () => {
    // Arrange
    const hold = partOf('hold', point(A), { inboundMag: 90, inboundTrue: 90 });
    const mixed: Chart = [
      ...chart,
      itemOf('hold', hold),
      ...chartWith(partOf('conv', line(A, B), { name: 'R' })),
    ];

    // Act
    const { points } = topologyOf(mixed);

    // Assert
    expect(points.map((p) => [p.layer, p.id, p.at])).toEqual([
      ['fix', 'TAVRO', A],
      ['vfr', 'CAUSE', B],
      ['vfr', 'CAUSE', E],
      ['navaid', 'QDG', C],
      ['ad', 'QAAA', D],
    ]);
  });

  it("gives every point of an item its first part's kind, undefined when it has none", () => {
    // Arrange
    const chartOfKinds: Chart = [
      itemOf(
        'navaid',
        partOf('navaid', point(A), { id: 'QDG', kind: 'VOR' }),
        partOf('navaid', point(B), { id: 'QDG', kind: 'NDB' }),
      ),
      itemOf('navaid', partOf('navaid', point(C), { id: 'QIK' })),
    ];

    // Act
    const { points } = topologyOf(chartOfKinds);

    // Assert
    expect(points.map((p) => p.kind)).toEqual(['VOR', 'VOR', undefined]);
  });

  it('draws the points of the layers given, whatever routes are shown', () => {
    // Arrange
    const topology = topologyOf(chart);
    const rows: [Layer[], boolean][] = [
      [['fix'], true],
      [['conv'], true],
      [[], true],
      [['navaid', 'fix'], true],
      [['navaid', 'fix'], false],
    ];
    const items = rows.map(([layers, inRange]) =>
      drawnItemsOf(chart, layers, allShown, () => inRange),
    );

    // Act
    const drawn = items.map((drawnItems) => drawnPointsOf(topology, drawnItems).map((p) => p.id));

    // Assert
    expect(drawn).toEqual([['TAVRO'], [], [], ['TAVRO', 'QDG'], ['TAVRO']]);
  });
});

describe('the vertex of a point', () => {
  it('is the vertex of the route position at its identity, and its own where no route is', () => {
    // Arrange
    const nearB: LonLat = [130.700004, 33.7];
    const chart: Chart = [
      ...chartWith(partOf('conv', line(A, B), { name: 'R' })),
      itemOf('fix', partOf('fix', point(nearB), { id: 'ON' })),
      itemOf('fix', partOf('fix', point(E), { id: 'OFF' })),
    ];

    // Act
    const {
      routes: {
        paths: [path],
      },
      points: [on, off],
    } = topologyOf(chart);

    // Assert
    expect(on?.vertex).toBe(path?.vertices[1]);
    expect(off?.vertex).not.toBe(path?.vertices[0]);
    expect(off?.vertex).not.toBe(path?.vertices[1]);
  });
});
