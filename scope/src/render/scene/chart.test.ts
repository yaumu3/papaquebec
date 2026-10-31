import { describe, expect, it } from 'bun:test';

import { type Chart, type ChartItem, chartOf, type ItemPart } from '../../lib/chart';
import { DRAW_STACK, isStyled, type StyledLayer, visibleLayers } from '../../lib/layers';
import { parseMapSet } from '../../lib/mapset';
import { isPointLayer, POINT_LAYERS, ROUTE_LAYERS } from '../../lib/mapsetFormat';
import { drawnPointsOf, topologyOf } from '../../lib/topology';
import { LABEL_DENSITIES, type LabelDensity } from '../../state/settingsDefaults';
import { type Batch, LINE_STRIDE, MARKER_STRIDE, Shape, TEXT_STRIDE } from '../protocol';
import { atlas } from './atlasFixture';
import { buildChart } from './chart';
import { parseColor } from './pack';

const project = (lat: number, lon: number) => ({ x: lon, y: lat });

type Geometry = ItemPart['geometry'];
type Position = [number, number];

const line = (...at: Position[]): Geometry => ({ type: 'LineString', coordinates: at });
const polygon = (...rings: Position[][]): Geometry => ({ type: 'Polygon', coordinates: rings });
const point = (at: Position): Geometry => ({ type: 'Point', coordinates: at });
/** A closed triangle, so its ring has three edges. */
const triangle = (x: number): Position[] => [
  [x, 0],
  [x + 0.01, 0],
  [x + 0.01, 0.01],
  [x, 0],
];

const has = (layers: readonly string[], layer: string) => layers.includes(layer);

/** What a test may add to a part: a kind, a name, or for an area a lower limit. */
interface Extra {
  kind?: string;
  name?: string;
  lower?: string;
}

/** The properties each group of layers carries; `extra` adds a kind, a name or a lower limit. */
function partOf(layer: StyledLayer, geometry: Geometry, extra: Extra = {}): ItemPart {
  const properties = isPointLayer(layer)
    ? { layer, id: 'Q', ...extra }
    : { layer, name: 'Q', ...extra };
  return { geometry, properties };
}

const itemOf = (layer: StyledLayer, ...parts: ItemPart[]): ChartItem => ({
  key: layer,
  layer,
  parts,
});

const build = (
  items: Chart,
  layers: readonly StyledLayer[] = DRAW_STACK.filter(isStyled),
  labelDensity: LabelDensity = 'normal',
) => {
  const topology = topologyOf(items);
  const drawnPoints = () => drawnPointsOf(topology, layers);
  return buildChart({ topology, drawnPoints, project, layers, labelDensity, atlas });
};

interface Instance {
  a: { x: number; y: number };
  b: { x: number; y: number };
  width: number;
  along: number;
  pattern: number[];
  color: number[];
  /** The distance back to the span's first stop and ahead to its last, and the two cuts. */
  span: number[];
}

/** The instances of a lines batch, as they were packed. */
function instances(batch: Batch): Instance[] {
  const d = batch.data;
  return Array.from({ length: batch.count }, (_, i) => {
    const o = i * LINE_STRIDE;
    const at = (k: number) => ({ x: d[o + k] ?? 0, y: d[o + k + 1] ?? 0 });
    return {
      a: at(0),
      b: at(4),
      width: d[o + 8] ?? 0,
      along: d[o + 9] ?? 0,
      pattern: Array.from(d.subarray(o + 10, o + 14)),
      color: Array.from(d.subarray(o + 14, o + 18)),
      span: Array.from(d.subarray(o + 18, o + 22)),
    };
  });
}

/** The unit floats a hex colour packs to. */
const packed = (hex: string) => parseColor(hex).map((c) => Math.fround(c));

describe('buildChart lines', () => {
  it('styles each layer, refined by the kind or the stratum of the part', () => {
    // Arrange
    const dim = '#5e3a3a';
    const bright = '#a04040';
    const grey = '#4a4a47';
    const procedure = '#33606c';
    const rows: {
      layer: StyledLayer;
      extra?: object;
      color: string;
      pattern: number[];
      width?: number;
    }[] = [
      { layer: 'ctr', color: bright, pattern: [0, 0, 0, 0] },
      { layer: 'pr', color: bright, pattern: [4, 3, 0, 0] },
      { layer: 'pr', extra: { kind: 'P' }, color: bright, pattern: [0, 0, 0, 0] },
      { layer: 'pr', extra: { kind: 'R' }, color: bright, pattern: [4, 3, 0, 0] },
      { layer: 'tma', color: dim, pattern: [0, 0, 0, 0] },
      { layer: 'tma', extra: { kind: 'MIL' }, color: dim, pattern: [8, 3, 0, 0] },
      { layer: 'sector', color: '#4a6878', pattern: [6, 4, 0, 0] },
      { layer: 'sector', extra: { lower: 'FL335' }, color: '#4a6878', pattern: [12, 4, 0, 0] },
      { layer: 'sector', extra: { lower: 'SFC' }, color: '#4a6878', pattern: [6, 4, 0, 0] },
      { layer: 'fir', color: '#606060', pattern: [16, 5, 0, 0] },
      { layer: 'dng', color: dim, pattern: [4, 3, 0, 0] },
      { layer: 'tra', color: dim, pattern: [4, 3, 0, 0] },
      { layer: 'adiz', color: grey, pattern: [16, 4, 2, 4] },
      { layer: 'cta', color: dim, pattern: [0, 0, 0, 0] },
      { layer: 'cta', extra: { kind: 'PCA' }, color: dim, pattern: [12, 6, 0, 0] },
      { layer: 'advisory', color: dim, pattern: [10, 3, 2, 3] },
      { layer: 'civt', color: dim, pattern: [2, 3, 0, 0] },
      { layer: 'asr', color: grey, pattern: [2, 4, 0, 0] },
      { layer: 'conv', color: '#82573c', pattern: [0, 0, 0, 0] },
      { layer: 'rnav', color: '#3a6a78', pattern: [0, 0, 0, 0] },
      { layer: 'dct', color: '#82573c', pattern: [0, 0, 0, 0], width: 0.5 },
      { layer: 'sid', color: procedure, pattern: [0, 0, 0, 0] },
      { layer: 'star', color: procedure, pattern: [6, 3, 0, 0] },
      { layer: 'trans', color: procedure, pattern: [10, 4, 0, 0] },
    ];
    const items = rows.map((r) =>
      itemOf(r.layer, partOf(r.layer, line([0, 0], [0.01, 0]), r.extra)),
    );

    // Act
    const drawn = items.map((item) => instances(build([item]).lines)[0]);

    // Assert
    expect(drawn.map((i) => i?.color)).toEqual(rows.map((r) => packed(r.color)));
    expect(drawn.map((i) => i?.pattern)).toEqual(rows.map((r) => r.pattern));
    expect(drawn.map((i) => i?.width)).toEqual(rows.map((r) => r.width ?? 1));
  });

  it('runs the dash on across a vertex', () => {
    // Arrange
    const item = itemOf('fir', partOf('fir', line([0, 0], [0.03, 0], [0.03, 0.04])));

    // Act
    const [first, second] = instances(build([item]).lines);

    // Assert
    expect(first?.along).toBe(0);
    expect(second?.along).toBeCloseTo(0.03, 6);
  });

  it('draws a line area open, and a polygon along its ring without closing it again', () => {
    // Arrange
    const open = itemOf('sector', partOf('sector', line([0, 0], [1, 0], [1, 1])));
    const closed = itemOf('ctr', partOf('ctr', polygon(triangle(0))));

    // Act
    const counts = [open, closed].map((item) => build([item]).lines.count);

    // Assert
    expect(counts).toEqual([2, 3]);
  });

  it('draws the holes of a polygon and every part of an item', () => {
    // Arrange
    const holed = itemOf('tma', partOf('tma', polygon(triangle(0), triangle(0.5))));
    const stepped = itemOf(
      'tma',
      partOf('tma', polygon(triangle(0))),
      partOf('tma', polygon(triangle(2))),
    );

    // Act
    const counts = [holed, stepped].map((item) => build([item]).lines.count);

    // Assert
    expect(counts).toEqual([6, 6]);
  });

  it('draws nothing for a layer that is not among those shown', () => {
    // Arrange
    const item = itemOf('ctr', partOf('ctr', polygon(triangle(0))));
    const shown: StyledLayer[] = ['fir', 'sid'];

    // Act
    const batches = build([item], shown, 'dense');

    // Assert
    expect([batches.lines.count, batches.markers.count, batches.labels.count]).toEqual([0, 0, 0]);
  });

  it('draws the layers back to front in the stack, each read by where its item sits', () => {
    // Arrange
    const lineLayers = DRAW_STACK.filter(isStyled).filter((l) => !has(POINT_LAYERS, l));
    const items = lineLayers.map((layer) =>
      itemOf(
        layer,
        partOf(layer, line([0, DRAW_STACK.indexOf(layer)], [0.01, DRAW_STACK.indexOf(layer)])),
      ),
    );
    const shuffled = items.toReversed();
    const expected = lineLayers.map((l) => DRAW_STACK.indexOf(l)).toReversed();

    // Act
    const drawn = instances(build(shuffled).lines).map((i) => i.a.y);

    // Assert
    expect(drawn).toEqual(expected);
  });
});

describe('buildChart shared edges', () => {
  it("draws an edge two layers share once, in the front layer's colour, and hands it down when the front layer is hidden", () => {
    // Arrange
    const items = [
      itemOf('fir', partOf('fir', line([0, 0], [1, 0], [0, 1]))),
      itemOf('tma', partOf('tma', line([0, 0], [1, 0], [1, 1]))),
    ];
    const rows: StyledLayer[][] = [['tma', 'fir'], ['fir']];

    // Act
    const drawn = rows.map((layers) => instances(build(items, layers).lines));

    // Assert
    expect(drawn.map((batch) => batch.map((i) => [i.a.x, i.a.y, i.b.x, i.b.y]))).toEqual([
      [
        [1, 0, 0, 1],
        [0, 0, 1, 0],
        [1, 0, 1, 1],
      ],
      [
        [0, 0, 1, 0],
        [1, 0, 0, 1],
      ],
    ]);
    expect(drawn.map((batch) => batch.map((i) => i.color))).toEqual([
      [packed('#606060'), packed('#5e3a3a'), packed('#5e3a3a')],
      [packed('#606060'), packed('#606060')],
    ]);
  });

  it("draws the footprint two strata share once, with the lower stratum's dash, whichever part comes first", () => {
    // Arrange
    const lower = partOf(
      'sector',
      polygon([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ]),
    );
    const upper = partOf(
      'sector',
      polygon([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ]),
      { lower: 'FL335' },
    );
    const orders = [
      [lower, upper],
      [upper, lower],
    ];

    // Act
    const dashes = orders.map((parts) =>
      instances(build([itemOf('sector', ...parts)]).lines)
        .map((i) => i.pattern[0])
        .toSorted((a, b) => (a ?? 0) - (b ?? 0)),
    );

    // Assert
    expect(dashes).toEqual([
      [6, 6, 6, 12, 12],
      [6, 6, 6, 12, 12],
    ]);
  });

  it('draws the edge two parts of one stepped item share once', () => {
    // Arrange
    const base = partOf(
      'tma',
      polygon([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ]),
    );
    const step = partOf(
      'tma',
      polygon([
        [1, 0],
        [2, 0],
        [2, 1],
        [1, 1],
        [1, 0],
      ]),
    );

    // Act
    const { lines } = build([itemOf('tma', base, step)]);

    // Assert
    expect(lines.count).toBe(7);
  });

  it('splits a path at an edge it shares, and restarts the dash in the next run', () => {
    // Arrange
    const items = [
      itemOf('fir', partOf('fir', line([0, 0], [1, 0], [2, 0], [3, 0], [4, 0]))),
      itemOf('tma', partOf('tma', line([1, 0], [2, 0]))),
    ];

    // Act
    const drawn = instances(build(items).lines).map((i) => [i.a.x, i.along]);

    // Assert
    expect(drawn).toEqual([
      [0, 0],
      [2, 0],
      [3, 1],
      [1, 0],
    ]);
  });

  it('draws a route segment two routes share once, as the front layer', () => {
    // Arrange
    const items = [
      itemOf('rnav', partOf('rnav', line([1, 0], [2, 0], [2, 1]))),
      itemOf('conv', partOf('conv', line([0, 0], [1, 0], [2, 0]))),
    ];

    // Act
    const drawn = instances(build(items).lines);

    // Assert
    expect(drawn.map((i) => [i.a.x, i.a.y, i.b.x, i.b.y].concat(i.color))).toEqual([
      [2, 0, 2, 1].concat(packed('#3a6a78')),
      [0, 0, 1, 0].concat(packed('#82573c')),
      [1, 0, 2, 0].concat(packed('#82573c')),
    ]);
  });

  it('keeps an area and a route on one line apart, and draws both', () => {
    // Arrange
    const items = [
      itemOf('sector', partOf('sector', line([0, 0], [1, 0]))),
      itemOf('conv', partOf('conv', line([0, 0], [1, 0]))),
    ];

    // Act
    const { lines } = build(items);

    // Assert
    expect(lines.count).toBe(2);
  });

  it('labels an item from its whole path even when it owns none of its edges', () => {
    // Arrange
    const items = [
      itemOf('conv', partOf('conv', line([0, 0], [1, 0], [2, 0]))),
      itemOf('rnav', partOf('rnav', line([0, 0], [1, 0], [2, 0]))),
    ];

    // Act
    const { labels } = build(items, ['conv', 'rnav'], 'dense');

    // Assert
    expect(glyphs(labels).map((g) => g.at.x)).toEqual([1, 1]);
  });
});

const chord = ({ a, b }: Instance) => Math.hypot(b.x - a.x, b.y - a.y);

/** Whether any part of an instance shows at `pxPerNm`, by the line shader's rule for the cuts. */
function visibleAt(i: Instance, pxPerNm: number): boolean {
  const [back, ahead, cutBack, cutAhead] = i.span;
  const len = chord(i) * pxPerNm;
  const from = cutBack ? Math.max(0, (cutBack - (back ?? 0) * pxPerNm) / len) : 0;
  const to = cutAhead ? Math.min(1, 1 - (cutAhead - (ahead ?? 0) * pxPerNm) / len) : 1;
  return from <= to;
}

const stopAt = (layer: StyledLayer, at: Position) => itemOf(layer, partOf(layer, point(at)));
const routeOf = (layer: StyledLayer, ...at: Position[]) =>
  itemOf(layer, partOf(layer, line(...at)));

describe('buildChart routes stop short of points', () => {
  const conv = packed('#82573c');
  const cutsOf = (items: ChartItem[], layers?: readonly StyledLayer[]) =>
    instances(build(items, layers).lines)
      .filter((i) => i.color.every((c, k) => c === conv[k]))
      .map((i) => i.span);

  it('cuts a route back at a stop on either side of it', () => {
    // Arrange
    const items = [routeOf('conv', [0, 0], [1, 0], [2, 0]), stopAt('fix', [1, 0])];

    // Act
    const cuts = new Set(
      cutsOf(items, ['conv', 'fix']).map(([, , back, ahead]) => `${back},${ahead}`),
    );

    // Assert
    expect([...cuts].toSorted()).toEqual(['0,7', '7,0']);
  });

  it('measures the way back and ahead along the whole span, across vertices and runs', () => {
    // Arrange
    const rows: [string, ChartItem[], StyledLayer[], number[][]][] = [
      [
        'a stop at each end, across edges of unequal length',
        [
          routeOf('conv', [0, 0], [1, 0], [3, 0], [7, 0]),
          stopAt('fix', [0, 0]),
          stopAt('navaid', [7, 0]),
        ],
        ['conv', 'fix', 'navaid'],
        [
          [0, 6, 7, 8],
          [1, 4, 7, 8],
          [3, 0, 7, 8],
        ],
      ],
      [
        'a run another route owns in the middle',
        [
          routeOf('conv', [0, 0], [1, 0], [3, 0], [4, 0], [6, 0]),
          routeOf('sid', [1, 0], [3, 0]),
          stopAt('fix', [0, 0]),
          stopAt('fix', [6, 0]),
        ],
        ['sid', 'conv', 'fix'],
        [
          [0, 5, 7, 7],
          [3, 2, 7, 7],
          [4, 0, 7, 7],
        ],
      ],
      [
        'a stop inside a path, and none at its ends',
        [routeOf('conv', [0, 0], [2, 0], [3, 0], [5, 0]), stopAt('fix', [2, 0])],
        ['conv', 'fix'],
        [
          [0, 0, 0, 7],
          [0, 2, 7, 0],
          [1, 0, 7, 0],
        ],
      ],
    ];

    // Act
    const spans = rows.map(([, items, layers]) =>
      cutsOf(items, layers).map((span) => span.map((v) => Math.round(v * 1000) / 1000)),
    );

    // Assert
    expect(spans).toEqual(rows.map(([, , , expected]) => expected));
  });

  it('writes no cut where no point stands at a vertex, where the point layer is hidden, or the navaid is out of range', () => {
    // Arrange
    const through = routeOf('conv', [0, 0], [1, 0], [2, 0]);
    const rows: [string, ChartItem[], readonly StyledLayer[]][] = [
      ['a point off the route', [through, stopAt('fix', [5, 5])], ['conv', 'fix']],
      ['a hidden fix layer', [through, stopAt('fix', [1, 0])], ['conv']],
      [
        'a navaid beyond the range threshold',
        [through, stopAt('navaid', [1, 0])],
        visibleLayers(
          ['conv', 'navaid'],
          () => true,
          () => false,
        ),
      ],
    ];

    // Act
    const spans = rows.map(([, items, layers]) => cutsOf(items, layers));

    // Assert
    expect(spans.map((list) => list.every((s) => s.every((v) => v === 0)))).toEqual([
      true,
      true,
      true,
    ]);
    expect(spans.map((list) => list.length > 0)).toEqual([true, true, true]);
  });

  it('cuts half the marker plus 3 CSS px', () => {
    // Arrange
    const rows: [StyledLayer, number][] = [
      ['fix', 7],
      ['navaid', 8],
      ['ad', 7.5],
      ['vfr', 6],
    ];
    const charts = rows.map(([layer]) => ({
      layer,
      items: [routeOf('conv', [0, 0], [1, 0], [2, 0]), stopAt(layer, [1, 0])],
    }));

    // Act
    const cuts = charts.map(({ layer, items }) => cutsOf(items, ['conv', layer])[0]?.[3]);

    // Assert
    expect(cuts).toEqual(rows.map(([, cut]) => cut));
  });

  it('draws a span shorter than its two cuts at no zoom where it is short, and at a closer one, from one batch', () => {
    // Arrange
    const items = [
      routeOf('conv', [0, 0], [0.001, 0]),
      stopAt('fix', [0, 0]),
      stopAt('fix', [0.001, 0]),
    ];
    const drawn = instances(build(items, ['conv', 'fix']).lines);
    const [far, near] = [1000, 100_000];

    // Act
    const shown = [far, near].map((zoom) => drawn.some((i) => visibleAt(i, zoom)));

    // Assert
    expect(shown).toEqual([false, true]);
  });

  it('reads the drawn points only for a route or a point layer', () => {
    // Arrange
    const items = [
      routeOf('conv', [0, 0], [1, 0]),
      itemOf('tma', partOf('tma', polygon(triangle(0)))),
    ];
    const rows: StyledLayer[][] = [['tma'], [], ['conv'], ['fix']];
    const reads = rows.map(() => 0);
    const inputs = rows.map((layers, i) => ({
      topology: topologyOf(items),
      drawnPoints: () => {
        reads[i] = (reads[i] ?? 0) + 1;
        return [];
      },
      project,
      layers,
      labelDensity: 'normal' as const,
      atlas,
    }));

    // Act
    for (const input of inputs) buildChart(input);

    // Assert
    expect(reads.map((n) => n > 0)).toEqual([false, false, true, true]);
  });

  it('does not cut an area outline where a point stands on its vertex', () => {
    // Arrange
    const items = [itemOf('tma', partOf('tma', polygon(triangle(0)))), stopAt('fix', [0.01, 0])];

    // Act
    const { lines } = build(items, ['tma', 'fix']);

    // Assert
    expect(instances(lines).every((i) => i.span.every((v) => v === 0))).toBe(true);
    expect(lines.count).toBe(3);
  });
});

const markerXs = ({ count, data }: Batch) =>
  Array.from({ length: count }, (_, i) => data[i * MARKER_STRIDE]);

describe('buildChart markers', () => {
  it('draws each kind of point with its own glyph, size and colour', () => {
    // Arrange
    const rows: [StyledLayer, Shape, number, string][] = [
      ['ad', Shape.Ring, 9, '#8a8a8a'],
      ['navaid', Shape.Hexagon, 10, '#808080'],
      ['fix', Shape.Triangle, 8, '#707070'],
      ['vfr', Shape.Triangle, 6, '#5c5c5c'],
    ];
    const items = rows.map(([layer]) => itemOf(layer, partOf(layer, point([139.5, 35.5]))));

    // Act
    const read = items.map((item) =>
      Array.from(build([item]).markers.data.subarray(0, MARKER_STRIDE)),
    );

    // Assert
    expect(read.map((m) => [m[0], m[1]])).toEqual(rows.map(() => [139.5, 35.5]));
    expect(read.map((m) => [m[4], m[5]])).toEqual(rows.map(([, shape, size]) => [size, shape]));
    expect(read.map((m) => m.slice(6, 10))).toEqual(rows.map(([, , , hex]) => packed(hex)));
  });

  it('draws the points back to front in the stack', () => {
    // Arrange
    const pointLayers = DRAW_STACK.filter((l): l is StyledLayer => has(POINT_LAYERS, l));
    const items = pointLayers.map((layer) =>
      itemOf(layer, partOf(layer, point([DRAW_STACK.indexOf(layer), 0]))),
    );
    const expected = pointLayers.map((l) => DRAW_STACK.indexOf(l)).toReversed();

    // Act
    const xs = markerXs(build(items.toReversed()).markers);

    // Assert
    expect(xs).toEqual(expected);
  });

  it('draws the same navaid of two sets once, with its label, and one elsewhere twice', () => {
    // Arrange
    const navaidSet = (id: string, at: Position) =>
      parseMapSet({
        type: 'FeatureCollection',
        version: 2,
        id,
        title: id,
        features: [
          {
            type: 'Feature',
            properties: { layer: 'navaid', id: 'Q' },
            geometry: { type: 'Point', coordinates: at },
          },
        ],
      });
    const rows: Position[] = [
      [139.8, 35.5],
      [139.8, 35.7],
    ];
    const charts = rows.map((at) =>
      chartOf([navaidSet('first', [139.8, 35.5]), navaidSet('second', at)]),
    );

    // Act
    const drawn = charts.map((chart) => build(chart, ['navaid'], 'dense'));

    // Assert
    expect(drawn.map((d) => [d.markers.count, d.labels.count])).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });

  it('draws a route layer as lines only', () => {
    // Arrange
    const layer = ROUTE_LAYERS[0];
    const item = itemOf(layer, partOf(layer, line([0, 0], [0.01, 0])));

    // Act
    const batches = build([item]);

    // Assert
    expect([batches.lines.count, batches.markers.count]).toEqual([1, 0]);
  });
});

/** The glyph instances of a text batch: where each is anchored and the colour it is drawn in. */
function glyphs(batch: Batch) {
  const d = batch.data;
  return Array.from({ length: batch.count }, (_, i) => ({
    at: { x: d[i * TEXT_STRIDE] ?? 0, y: d[i * TEXT_STRIDE + 1] ?? 0 },
    color: Array.from(d.subarray(i * TEXT_STRIDE + 10, i * TEXT_STRIDE + 14)),
  }));
}

const rank = (d: LabelDensity) => LABEL_DENSITIES.indexOf(d);

/** A one-part item whose name is one glyph, so its label is one instance. */
const onePart = (layer: StyledLayer, geometry: Geometry, extra: Extra = {}) =>
  itemOf(layer, partOf(layer, geometry, extra));

const placeholder = (layer: StyledLayer): Geometry =>
  has(POINT_LAYERS, layer) ? point([0, 0]) : line([0, 0], [0.01, 0]);

describe('buildChart labels', () => {
  it('labels each layer from its own label density up, and some never', () => {
    // Arrange
    const from: [StyledLayer, LabelDensity | null][] = [
      ['ad', 'sparse'],
      ['navaid', 'sparse'],
      ['fix', 'normal'],
      ['sector', 'normal'],
      ['conv', 'normal'],
      ['rnav', 'normal'],
      ['trans', 'normal'],
      ['vfr', 'dense'],
      ['sid', 'dense'],
      ['star', 'dense'],
      ['ctr', 'dense'],
      ['pr', 'dense'],
      ['tma', 'dense'],
      ['dng', 'dense'],
      ['tra', 'dense'],
      ['cta', 'dense'],
      ['advisory', 'dense'],
      ['civt', 'dense'],
      ['asr', 'dense'],
      ['fir', null],
      ['adiz', null],
      ['dct', null],
    ];
    const expected = from.map(([, first]) =>
      LABEL_DENSITIES.map((d) => (first !== null && rank(d) >= rank(first) ? 1 : 0)),
    );

    // Act
    const counts = from.map(([layer]) =>
      LABEL_DENSITIES.map(
        (d) => build([onePart(layer, placeholder(layer))], [layer], d).labels.count,
      ),
    );

    // Assert
    expect(counts).toEqual(expected);
  });

  it('prints an area by its name alone, with no kind before it', () => {
    // Arrange
    const item = onePart('ctr', placeholder('ctr'), { kind: 'CTR' });

    // Act
    const { labels } = build([item], ['ctr'], 'dense');

    // Assert
    expect(labels.count).toBe(1);
  });

  it('prints a point by its ident, not by its name', () => {
    // Arrange
    const shown: StyledLayer[] = ['ad', 'navaid'];
    const items = shown.map((layer) => onePart(layer, point([0, 0]), { name: 'PAPAQ' }));

    // Act
    const counts = items.map((item) => build([item], shown, 'dense').labels.count);

    // Assert
    expect(counts).toEqual([1, 1]);
  });

  it('labels a stepped item once, where its first part starts', () => {
    // Arrange
    const first = partOf('tma', polygon(triangle(5), triangle(7)));
    const second = partOf('tma', polygon(triangle(9)));

    // Act
    const { labels } = build([itemOf('tma', first, second)], ['tma'], 'dense');

    // Assert
    expect(glyphs(labels).map((g) => g.at)).toEqual([{ x: 5, y: 0 }]);
  });

  it('labels each part of a point item where it sits', () => {
    // Arrange
    const west = partOf('vfr', point([0, 0]));
    const east = partOf('vfr', point([5, 0]));

    // Act
    const { markers, labels } = build([itemOf('vfr', west, east)], ['vfr'], 'dense');

    // Assert
    expect(markers.count).toBe(2);
    expect(glyphs(labels).map((g) => g.at.x)).toEqual([0, 5]);
  });

  it('puts a route label at the middle of its path and an area label at its start', () => {
    // Arrange
    const path = line([0, 0], [1, 0], [2, 0]);
    const rows: [StyledLayer, number][] = [
      ['conv', 1],
      ['ctr', 0],
    ];

    // Act
    const placed = rows.map(([layer]) =>
      glyphs(build([onePart(layer, path)], [layer], 'dense').labels).map((g) => g.at.x),
    );

    // Assert
    expect(placed).toEqual(rows.map(([, x]) => [x]));
  });

  it('colours each label by its layer', () => {
    // Arrange
    const rows: [StyledLayer, string][] = [
      ['ad', '#a0a0a0'],
      ['navaid', '#909090'],
      ['fix', '#7a7a7a'],
      ['vfr', '#6a6a6a'],
      ['sector', '#5a7a8a'],
      ['asr', '#5a7a8a'],
      ['ctr', '#8a5050'],
      ['conv', '#9a6a4c'],
      ['rnav', '#4a8090'],
      ['sid', '#40707c'],
      ['star', '#40707c'],
      ['trans', '#40707c'],
    ];

    // Act
    const colours = rows.map(([layer]) => {
      const { labels } = build([onePart(layer, placeholder(layer))], [layer], 'dense');
      return glyphs(labels)[0]?.color;
    });

    // Assert
    expect(colours).toEqual(rows.map(([, hex]) => packed(hex)));
  });
});
