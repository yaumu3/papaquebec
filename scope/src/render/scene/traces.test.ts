import { describe, expect, it } from 'bun:test';

import type { ChartItem, ItemPart } from '../../lib/chart';
import { type Batch, LINE_STRIDE, MARKER_STRIDE } from '../protocol';
import { atlas } from './atlasFixture';
import { glyphs, instances, packed, project, withoutColor } from './chartFixture';
import type { DrawnLabel } from './drawnLabels';
import { LAYER_STYLES } from './layerStyles';
import { LineBatch, TextBatch } from './pack';
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

type Input = Omit<Parameters<typeof buildTraces>[0], 'atlas' | 'pointedLabel'> &
  Partial<Pick<Parameters<typeof buildTraces>[0], 'pointedLabel'>>;

/** The traces of `input`, with no label of what is pointed at unless it comes with one. */
const tracesOf = (input: Input) => buildTraces({ atlas, pointedLabel: undefined, ...input });

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
    const [, , lines, dots] = tracesOf({ pointedAt: stepped, searched: [], project });

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
    const [, , lines] = tracesOf({ pointedAt: through, searched: [], project });

    // Assert
    expect(segments(lines).flatMap((s) => s.span)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("draws a point as its layer's own symbol, one for each part", () => {
    // Arrange
    const layers = ['ad', 'navaid', 'fix', 'vfr'] as const;
    const pointed = layers.map((layer) => point(layer, pointAt([1, 2]), pointAt([3, 4])));

    // Act
    const traced = pointed.map((pointedAt) => tracesOf({ pointedAt, searched: [], project })[3]);

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
    const [, , lines, dots] = tracesOf({ pointedAt: hold, searched: [], project });

    // Assert
    expect([lines.count, dots.count]).toEqual([0, 0]);
  });

  it('draws nothing when nothing is pointed at', () => {
    // Arrange
    const none = null;

    // Act
    const [, , lines, dots] = tracesOf({ pointedAt: none, searched: [], project });

    // Assert
    expect([lines.count, dots.count]).toEqual([0, 0]);
  });

  it('draws what the search names at half strength, a point as its own symbol', () => {
    // Arrange
    const found = [area(lineOf([0, 0], [1, 0], [1, 1])), fix(pointAt([5, 6]))];

    // Act
    const [lines, dots] = tracesOf({ pointedAt: null, searched: found, project });

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
    const batches = tracesOf({ pointedAt: null, searched: [hold], project });

    // Assert
    expect(batches.map((b) => b.count)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('puts the search first and what is pointed at over it, an item in both drawn in both', () => {
    // Arrange
    const both = fix(pointAt([1, 2]));
    const onlySearched = area(lineOf([0, 0], [1, 0]));

    // Act
    const [searchLines, searchDots, pointedLines, pointedDots] = tracesOf({
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
    const batches = tracesOf(none);

    // Assert
    expect(batches.map((b) => b.count)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  describe('the label of what is pointed at', () => {
    const label: DrawnLabel = {
      spans: ['S'],
      gaps: [
        {
          from: { x: 1, y: 2, px: -9, py: 0 },
          to: { x: 1, y: 2, px: 20, py: 0 },
          color: THEME.bg,
          width: 12,
        },
      ],
      texts: [
        {
          text: 'V901',
          at: { x: 1, y: 2, px: -5, py: 0 },
          size: 9,
          color: '#9a6a4c',
          style: { baseline: 'middle', angle: 0.5, halo: true },
        },
      ],
      strokes: [
        {
          from: { x: 1, y: 2, px: 12, py: -3 },
          to: { x: 1, y: 2, px: 15, py: 0 },
          color: '#9a6a4c',
          width: 1.3,
        },
      ],
    };

    const pointed = { pointedAt: route(lineOf([0, 0], [1, 0])), searched: [], project };

    it('draws its text again in the hover grey, as the chart drew it', () => {
      // Arrange
      const [run] = label.texts;
      const expected = new TextBatch(atlas);
      if (run) expected.text(run.text, run.at, run.size, run.color, run.style);
      const input = { ...pointed, pointedLabel: label };

      // Act
      const [, , , , , text] = tracesOf(input);

      // Assert
      const drawn = glyphs(text);
      expect(drawn.length).toBeGreaterThan(0);
      expect(withoutColor(drawn)).toEqual(withoutColor(glyphs(expected.finish())));
      expect(drawn.map((g) => g.color)).toEqual(drawn.map(() => grey));
    });

    it('draws its segments again in the hover grey, and its gaps in the background', () => {
      // Arrange
      const [arm] = label.strokes;
      const [gap] = label.gaps;
      const [wantedArm, wantedGap] = [new LineBatch(), new LineBatch()];
      if (arm) wantedArm.segment(arm.from, arm.to, THEME.hover, { width: arm.width });
      if (gap) wantedGap.segment(gap.from, gap.to, THEME.bg, { width: gap.width });
      const input = { ...pointed, pointedLabel: label };

      // Act
      const [, , , , gaps, , strokes] = tracesOf(input);

      // Assert
      expect(instances(gaps)).toEqual(instances(wantedGap.finish()));
      expect(instances(strokes)).toEqual(instances(wantedArm.finish()));
    });
  });
});
