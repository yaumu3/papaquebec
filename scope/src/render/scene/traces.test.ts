import { describe, expect, it } from 'bun:test';

import type { ChartItem, ItemPart } from '../../lib/chart';
import { type Batch, LINE_STRIDE, MARKER_STRIDE } from '../protocol';
import { packed, project } from './chartFixture';
import { LAYER_STYLES } from './layerStyles';
import { THEME } from './rules';
import { buildTraces } from './traces';

type Position = [number, number];

const lineOf = (...at: Position[]): ItemPart['geometry'] => ({
  type: 'LineString',
  coordinates: at,
});
const pointAt = (at: Position): ItemPart['geometry'] => ({ type: 'Point', coordinates: at });

const item = (
  layer: ChartItem['layer'],
  properties: ItemPart['properties'],
  ...parts: ItemPart['geometry'][]
): ChartItem => ({ key: layer, layer, parts: parts.map((geometry) => ({ geometry, properties })) });

const area = (...parts: ItemPart['geometry'][]) =>
  item('tma', { layer: 'tma', name: 'Q' }, ...parts);
const route = (...parts: ItemPart['geometry'][]) =>
  item('conv', { layer: 'conv', name: 'Q' }, ...parts);
const point = (layer: 'ad' | 'navaid' | 'fix' | 'vfr', ...parts: ItemPart['geometry'][]) =>
  item(layer, { layer, id: 'Q' }, ...parts);
const fix = (...parts: ItemPart['geometry'][]) => point('fix', ...parts);

const square = (x: number, size: number): Position[] => [
  [x, 0],
  [x + size, 0],
  [x + size, size],
  [x, size],
  [x, 0],
];

/** The segments of a lines batch as packed: where from and to, how wide, how dashed, in what colour. */
function segments({ data, count }: Batch) {
  return Array.from({ length: count }, (_, i) => {
    const o = i * LINE_STRIDE;
    return {
      from: [data[o], data[o + 1]],
      to: [data[o + 4], data[o + 5]],
      width: data[o + 8],
      pattern: Array.from(data.subarray(o + 10, o + 14)),
      color: Array.from(data.subarray(o + 14, o + 18)),
      span: Array.from(data.subarray(o + 18, o + 22)),
    };
  });
}

/** The markers of a markers batch as packed. */
function markers({ data, count }: Batch) {
  return Array.from({ length: count }, (_, i) => {
    const o = i * MARKER_STRIDE;
    return {
      at: [data[o], data[o + 1]],
      size: data[o + 4],
      shape: data[o + 5],
      color: Array.from(data.subarray(o + 6, o + 10)),
    };
  });
}

type Input = Omit<Parameters<typeof buildTraces>[0], 'highlight'> &
  Partial<Pick<Parameters<typeof buildTraces>[0], 'highlight'>>;

/** The traces of `input`, with no highlight unless it comes with one. */
const tracesOf = (input: Input) => buildTraces({ highlight: [], ...input });

const batchOf = (kind: Batch['kind']): Batch => ({ kind, data: new Float32Array(), count: 0 });

const grey = packed(THEME.hover);
const faint = packed(THEME.hoverFaint);

describe('buildTraces', () => {
  it('draws every outline of every part, 2 px wide and solid in the hover grey', () => {
    // Arrange
    const polygon: ItemPart['geometry'] = {
      type: 'Polygon',
      coordinates: [square(0, 1), square(0.25, 0.5)],
    };
    const stepped = area(polygon, lineOf([5, 0], [6, 0], [6, 1]));

    // Act
    const {
      traces: [, lines],
      tracedPoints: [, dots],
    } = tracesOf({ pointedAt: stepped, searched: [], project });

    // Assert
    const drawn = segments(lines);
    expect(drawn).toHaveLength(4 + 4 + 2);
    expect(drawn.map((s) => s.width)).toEqual(drawn.map(() => 2));
    expect(drawn.map((s) => s.pattern)).toEqual(drawn.map(() => [0, 0, 0, 0]));
    expect(drawn.map((s) => s.color)).toEqual(drawn.map(() => grey));
    expect(dots.count).toBe(0);
  });

  it('does not cut a route back at the points it passes', () => {
    // Arrange
    const through = route(lineOf([0, 0], [1, 0], [2, 0]));

    // Act
    const {
      traces: [, lines],
    } = tracesOf({ pointedAt: through, searched: [], project });

    // Assert
    expect(segments(lines).flatMap((s) => s.span)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("draws a point as its layer's own symbol, one for each part", () => {
    // Arrange
    const layers = ['ad', 'navaid', 'fix', 'vfr'] as const;
    const pointed = layers.map((layer) => point(layer, pointAt([1, 2]), pointAt([3, 4])));

    // Act
    const traced = pointed.map(
      (pointedAt) => tracesOf({ pointedAt, searched: [], project }).tracedPoints[1],
    );

    // Assert
    const expected = layers.map((layer) => {
      const { shape, size } = LAYER_STYLES[layer];
      return [
        { at: [1, 2], size, shape, color: grey },
        { at: [3, 4], size, shape, color: grey },
      ];
    });
    expect(traced.map(markers)).toEqual(expected);
  });

  it('draws nothing for a hold, whose racetrack comes later', () => {
    // Arrange
    const hold = item('hold', { layer: 'hold', turn: 'R', inboundMag: 90 }, pointAt([1, 2]));

    // Act
    const {
      traces: [, lines],
      tracedPoints: [, dots],
    } = tracesOf({ pointedAt: hold, searched: [], project });

    // Assert
    expect([lines.count, dots.count]).toEqual([0, 0]);
  });

  it('draws nothing when nothing is pointed at', () => {
    // Arrange
    const none = null;

    // Act
    const {
      traces: [, lines],
      tracedPoints: [, dots],
    } = tracesOf({ pointedAt: none, searched: [], project });

    // Assert
    expect([lines.count, dots.count]).toEqual([0, 0]);
  });

  it('draws what the search names at half strength, a point as its own symbol', () => {
    // Arrange
    const found = [area(lineOf([0, 0], [1, 0], [1, 1])), fix(pointAt([5, 6]))];

    // Act
    const {
      traces: [lines],
      tracedPoints: [dots],
    } = tracesOf({ pointedAt: null, searched: found, project });

    // Assert
    const drawn = segments(lines);
    expect(drawn.map((x) => x.color)).toEqual(drawn.map(() => faint));
    expect(drawn.map((x) => [x.width, x.pattern])).toEqual(drawn.map(() => [2, [0, 0, 0, 0]]));
    const { shape, size } = LAYER_STYLES.fix;
    expect(markers(dots)).toEqual([{ at: [5, 6], size, shape, color: faint }]);
    expect(faint[3]).toBeCloseTo(128 / 255, 2);
  });

  it('draws a hold the search names as nothing', () => {
    // Arrange
    const hold = item('hold', { layer: 'hold', turn: 'R', inboundMag: 90 }, pointAt([1, 2]));

    // Act
    const { traces, tracedPoints } = tracesOf({ pointedAt: null, searched: [hold], project });

    // Assert
    expect([...traces, ...tracedPoints].map((b) => b.count)).toEqual([0, 0, 0, 0]);
  });

  it('puts the search first and what is pointed at over it, an item in both drawn in both', () => {
    // Arrange
    const both = fix(pointAt([1, 2]));
    const onlySearched = area(lineOf([0, 0], [1, 0]));

    // Act
    const {
      traces: [searchLines, pointedLines],
      tracedPoints: [searchDots, pointedDots],
    } = tracesOf({
      pointedAt: both,
      searched: [onlySearched, both],
      project,
    });

    // Assert
    expect(segments(searchLines)).toHaveLength(1);
    expect(markers(searchDots).map((m) => m.color)).toEqual([faint]);
    expect(pointedLines.count).toBe(0);
    expect(markers(pointedDots).map((m) => m.color)).toEqual([grey]);
  });

  it('gives only empty batches when nothing is searched or pointed at', () => {
    // Arrange
    const none = { pointedAt: null, searched: [], project };

    // Act
    const { traces, tracedPoints } = tracesOf(none);

    // Assert
    expect([...traces, ...tracedPoints].map((b) => b.count)).toEqual([0, 0, 0, 0]);
  });

  it("puts a route's highlight in traces, after its lines, and none in tracedPoints", () => {
    // Arrange
    const highlight = [batchOf('lines'), batchOf('text'), batchOf('lines')];
    const input = { pointedAt: route(lineOf([0, 0], [1, 0])), searched: [], project, highlight };

    // Act
    const { traces, tracedPoints } = tracesOf(input);

    // Assert
    expect(traces.slice(2)).toEqual(highlight);
    expect(traces.slice(2).every((b, i) => b === highlight[i])).toBe(true);
    expect(tracedPoints).toHaveLength(2);
  });

  it("puts a point's highlight in tracedPoints, after its symbol, and none in traces", () => {
    // Arrange
    const highlight = [batchOf('lines'), batchOf('text'), batchOf('lines')];
    const input = { pointedAt: fix(pointAt([1, 2])), searched: [], project, highlight };

    // Act
    const { traces, tracedPoints } = tracesOf(input);

    // Assert
    expect(tracedPoints.slice(2)).toEqual(highlight);
    expect(tracedPoints.slice(2).every((b, i) => b === highlight[i])).toBe(true);
    expect(traces).toHaveLength(2);
  });
});
