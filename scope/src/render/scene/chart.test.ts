import { describe, expect, it } from 'bun:test';

import type { ChartItem, ItemPart } from '../../lib/chart';
import { DRAW_STACK, type StyledLayer } from '../../lib/layers';
import { POINT_LAYERS, ROUTE_LAYERS } from '../../lib/mapsetFormat';
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

/** The properties each group of layers carries; `extra` adds a kind or a lower limit. */
function partOf(layer: StyledLayer, geometry: Geometry, extra: object = {}): ItemPart {
  const named = has(POINT_LAYERS, layer) ? { id: 'Q' } : { name: 'Q' };
  return { geometry, properties: { layer, ...named, ...extra } as ItemPart['properties'] };
}

const itemOf = (layer: StyledLayer, ...parts: ItemPart[]): ChartItem => ({
  key: layer,
  layer,
  parts,
});

const build = (
  items: ChartItem[],
  layers: readonly StyledLayer[] = DRAW_STACK.filter(isStyled),
  labelDensity: LabelDensity = 'normal',
) => buildChart({ chart: items, project, layers, labelDensity, atlas });

function isStyled(layer: string): layer is StyledLayer {
  return layer !== 'hold' && layer !== 'coast' && layer !== 'rings';
}

interface Instance {
  a: { x: number; y: number };
  b: { x: number; y: number };
  width: number;
  along: number;
  pattern: number[];
  color: number[];
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

    // Act
    const drawn = instances(build(shuffled).lines).map((i) => i.a.y);

    // Assert
    const expected = lineLayers.map((l) => DRAW_STACK.indexOf(l)).toReversed();
    expect(drawn).toEqual(expected);
  });
});

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
    const drawn = items.map((item) => build([item]).markers);

    // Assert
    const read = drawn.map((b) => [...b.data.subarray(0, MARKER_STRIDE)]);
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

    // Act
    const { markers } = build(items.toReversed());

    // Assert
    const xs = Array.from({ length: markers.count }, (_, i) => markers.data[i * MARKER_STRIDE]);
    expect(xs).toEqual(pointLayers.map((l) => DRAW_STACK.indexOf(l)).toReversed());
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
const onePart = (layer: StyledLayer, geometry: Geometry, extra: object = {}) =>
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

    // Act
    const counts = from.map(([layer]) =>
      LABEL_DENSITIES.map(
        (d) => build([onePart(layer, placeholder(layer))], [layer], d).labels.count,
      ),
    );

    // Assert
    const expected = from.map(([, first]) =>
      LABEL_DENSITIES.map((d) => (first !== null && rank(d) >= rank(first) ? 1 : 0)),
    );
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

  it('labels a stepped item once, where its first part starts', () => {
    // Arrange
    const first = partOf('tma', polygon(triangle(5), triangle(7)));
    const second = partOf('tma', polygon(triangle(9)));

    // Act
    const { labels } = build([itemOf('tma', first, second)], ['tma'], 'dense');

    // Assert
    expect(glyphs(labels).map((g) => g.at)).toEqual([{ x: 5, y: 0 }]);
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
