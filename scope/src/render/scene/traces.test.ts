import { describe, expect, it } from 'bun:test';

import type { ChartItem, ItemPart } from '../../lib/chart';
import { type Batch, LINE_STRIDE, MARKER_STRIDE, Shape } from '../protocol';
import { parseColor } from './pack';
import { THEME } from './rules';
import { buildTraces } from './traces';

const project = (lat: number, lon: number) => ({ x: lon, y: lat });

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
const fix = (...parts: ItemPart['geometry'][]) => item('fix', { layer: 'fix', id: 'Q' }, ...parts);

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
    return { at: [data[o], data[o + 1]], size: data[o + 4], shape: data[o + 5] };
  });
}

const grey = parseColor(THEME.hover).map((c) => Math.fround(c));

describe('buildTraces', () => {
  it('draws every outline of every part, 2 px wide and solid in the hover grey', () => {
    // Arrange
    const polygon: ItemPart['geometry'] = {
      type: 'Polygon',
      coordinates: [square(0, 1), square(0.25, 0.5)],
    };
    const stepped = area(polygon, lineOf([5, 0], [6, 0], [6, 1]));

    // Act
    const [lines, dots] = buildTraces({ pointedAt: stepped, project });

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
    const [lines] = buildTraces({ pointedAt: through, project });

    // Assert
    expect(segments(lines).flatMap((s) => s.span)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('draws a point as a ring of 9 px radius, one for each part', () => {
    // Arrange
    const pointed = fix(pointAt([1, 2]), pointAt([3, 4]));

    // Act
    const [lines, dots] = buildTraces({ pointedAt: pointed, project });

    // Assert
    expect(lines.count).toBe(0);
    expect(markers(dots)).toEqual([
      { at: [1, 2], size: 18, shape: Shape.TraceRing },
      { at: [3, 4], size: 18, shape: Shape.TraceRing },
    ]);
  });

  it('draws nothing for a hold, whose racetrack comes later', () => {
    // Arrange
    const hold = item('hold', { layer: 'hold', turn: 'R', inboundMag: 90 }, pointAt([1, 2]));

    // Act
    const [lines, dots] = buildTraces({ pointedAt: hold, project });

    // Assert
    expect([lines.count, dots.count]).toEqual([0, 0]);
  });

  it('draws nothing when nothing is pointed at', () => {
    // Arrange
    const none = null;

    // Act
    const [lines, dots] = buildTraces({ pointedAt: none, project });

    // Assert
    expect([lines.count, dots.count]).toEqual([0, 0]);
  });
});
