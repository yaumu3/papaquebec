import { describe, expect, it } from 'bun:test';

import { type Chart, chartOf } from '../../lib/chart';
import type { ShownMemory } from '../../lib/fits';
import { distanceToSegment } from '../../lib/geo';
import { DRAW_STACK, drawnItemsOf, isStyled, type StyledLayer } from '../../lib/layers';
import { parseMapSet } from '../../lib/mapset';
import { EXAMPLE } from '../../lib/mapsetCorpus';
import { areaPlaceOf, poleOf } from '../../lib/pole';
import { drawnPointsOf, topologyOf } from '../../lib/topology';
import { shownExcept } from '../../lib/visibilityFixture';
import { LABEL_DENSITIES, type LabelDensity } from '../../state/settingsDefaults';
import { buildAreaLabels } from './areaLabels';
import { atlas } from './atlasFixture';
import type { FitInput } from './chart';
import {
  glyphs,
  itemOf,
  keyed,
  line,
  packed,
  partOf,
  polygon,
  type Position,
  project,
} from './chartFixture';

/** The area labels of `items` as the scope builds them. */
function build(
  items: Chart,
  layers: readonly StyledLayer[],
  labelDensity: LabelDensity = 'dense',
  hidden: string[] = [],
  fit: FitInput = { settledScale: () => 1000, shown: new Map() },
) {
  const topology = topologyOf(items);
  const drawnItems = drawnItemsOf(
    items,
    layers,
    () => shownExcept(...hidden),
    () => true,
  );
  const drawnPoints = () => drawnPointsOf(topology, drawnItems);
  const [text] = buildAreaLabels({
    topology,
    drawnPoints,
    project,
    layers,
    drawnItems,
    labelDensity,
    atlas,
    placeOf: (item) => areaPlaceOf(item, project),
    ...fit,
  });
  if (!text) throw new Error('buildAreaLabels returned no batch');
  return text;
}

/** Whether a point lies inside a ring, by the even-odd rule. */
function inside([x, y]: Position, ring: Position[]): boolean {
  const crossings = ring.filter(([ax, ay], i) => {
    const [bx, by] = ring[(i + 1) % ring.length] ?? [ax, ay];
    return ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax;
  });
  return crossings.length % 2 === 1;
}

/** How far a point is from the nearest edge of a ring. */
const clearance = ([x, y]: Position, ring: Position[]): number =>
  Math.min(
    ...ring.map(([ax, ay], i) => {
      const [bx, by] = ring[(i + 1) % ring.length] ?? [ax, ay];
      return distanceToSegment({ x, y }, { x: ax, y: ay }, { x: bx, y: by });
    }),
  );

const AREA_LAYERS = DRAW_STACK.filter(isStyled).filter((l) =>
  [
    'ctr',
    'pr',
    'tma',
    'sector',
    'fir',
    'dng',
    'tra',
    'adiz',
    'cta',
    'advisory',
    'civt',
    'asr',
  ].includes(l),
);
/** The density an area layer is labelled from; none for the layers that are not. */
const from = (layer: StyledLayer): LabelDensity | null =>
  layer === 'fir' || layer === 'adiz' ? null : layer === 'sector' ? 'normal' : 'dense';
/** Whether a layer's labels are drawn at a density: 1 or 0. */
const labelledAt = (layer: StyledLayer, d: LabelDensity) => {
  const first = from(layer);
  return first !== null && rank(d) >= rank(first) ? 1 : 0;
};
const rank = (d: LabelDensity) => LABEL_DENSITIES.indexOf(d);

/** An item named PAPAQ of one shape. */
const place = (shape: ReturnType<typeof polygon>) => [
  keyed('PAPAQ', itemOf('tma', partOf('tma', shape, { name: 'PAPAQ' }))),
];
/** Whether the name is drawn at a settled scale, given what was shown before. */
const drawn = (shape: ReturnType<typeof polygon>, scale: number, shown: ShownMemory) =>
  build(place(shape), ['tma'], 'dense', [], { settledScale: () => scale, shown }).count > 0;

describe('buildAreaLabels', () => {
  const el: Position[] = [
    [0, 0],
    [6, 0],
    [6, 2],
    [2, 2],
    [2, 6],
    [0, 6],
    [0, 0],
  ];

  it('puts the name at the pole of the area, inside it and off its boundary', () => {
    // Arrange
    const items = [itemOf('ctr', partOf('ctr', polygon(el)))];
    const pole = poleOf([el.map(([x, y]) => ({ x, y }))]);

    // Act
    const text = build(items, ['ctr']);

    // Assert
    const [glyph] = glyphs(text);
    expect(glyph?.at.x).toBeCloseTo(pole?.at.x ?? NaN, 9);
    expect(glyph?.at.y).toBeCloseTo(pole?.at.y ?? NaN, 9);
    expect(inside([glyph?.at.x ?? NaN, glyph?.at.y ?? NaN], el)).toBe(true);
    expect(clearance([glyph?.at.x ?? NaN, glyph?.at.y ?? NaN], el)).toBeGreaterThan(0.9);
  });

  it('centres the name on the pole, with a halo', () => {
    // Arrange
    const items = [itemOf('ctr', partOf('ctr', polygon(el)))];
    const scale = 9 / atlas.fontSize;
    const half = (1 * atlas.advance * scale) / 2;

    // Act
    const text = build(items, ['ctr']);

    // Assert
    const [glyph] = glyphs(text);
    expect(glyph?.px).toBeCloseTo(-half - atlas.buffer * scale, 6);
    expect(glyph?.halo).toBeGreaterThan(0);
  });

  it('labels a stepped item once', () => {
    // Arrange
    const items = chartOf([parseMapSet(EXAMPLE)]);

    // Act
    const text = build(items, ['tma']);

    // Assert
    const names = glyphs(text).map((g) => g.char);
    expect(names.join('')).toBe('PAPAQ');
  });

  it('puts the name of a line area at the middle of its line', () => {
    // Arrange
    const items = [itemOf('tma', partOf('tma', line([0, 0], [4, 0])))];

    // Act
    const text = build(items, ['tma']);

    // Assert
    const [glyph] = glyphs(text);
    expect(glyph?.at.x).toBeCloseTo(2, 6);
    expect(glyph?.at.y).toBeCloseTo(0, 6);
  });

  it('writes a sector name at 10 px and the name of another area at 9 px', () => {
    // Arrange
    const rows: StyledLayer[] = ['sector', 'ctr'];
    const items = rows.map((layer) => keyed(layer, itemOf(layer, partOf(layer, polygon(el)))));

    // Act
    const heights = rows.map((layer) => glyphs(build(items, [layer]))[0]?.h);

    // Assert
    expect(heights).toEqual([
      (atlas.cellH * 10) / atlas.fontSize,
      (atlas.cellH * 9) / atlas.fontSize,
    ]);
  });

  it('labels each area layer from its own density up, and the FIR and the ADIZ never', () => {
    // Arrange
    const expected = AREA_LAYERS.map((layer) => LABEL_DENSITIES.map((d) => labelledAt(layer, d)));

    // Act
    const counts = AREA_LAYERS.map((layer) =>
      LABEL_DENSITIES.map((d) => {
        const items = [itemOf(layer, partOf(layer, polygon(el)))];
        return build(items, [layer], d).count > 0 ? 1 : 0;
      }),
    );

    // Assert
    expect(counts).toEqual(expected);
  });

  it('colours each name by its layer, and gives a hidden area none', () => {
    // Arrange
    const rows: [StyledLayer, string][] = [
      ['ctr', '#8a5050'],
      ['sector', '#5a7a8a'],
      ['asr', '#5a7a8a'],
    ];
    const items = rows.map(([layer]) => keyed(layer, itemOf(layer, partOf(layer, polygon(el)))));

    // Act
    const colours = rows.map(([layer]) => glyphs(build(items, [layer]))[0]?.color);
    const hidden = build(items, ['ctr'], 'dense', ['ctr']);

    // Assert
    expect(colours).toEqual(rows.map(([, hex]) => packed(hex)));
    expect(hidden.count).toBe(0);
  });

  describe('at the settled scale', () => {
    const square: Position[] = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
      [0, 0],
    ];
    const threshold = (atlas.advance * 9 * 'PAPAQ'.length) / atlas.fontSize / 2;
    it('drops the name of an area too small for it, and shows it once it has room', () => {
      // Arrange
      const rows: [number, boolean][] = [
        [0.5 * threshold, false],
        [4 * threshold, true],
      ];

      // Act
      const shown = rows.map(([scale]) => drawn(polygon(square), scale, new Map()));

      // Assert
      expect(shown).toEqual(rows.map(([, expected]) => expected));
    });

    it('keeps the state of a name between its thresholds', () => {
      // Arrange
      const rows: [number[], boolean][] = [
        [[4, 1.05], true],
        [[4, 1.05, 0.9], false],
        [[0.9, 1.05], false],
      ];
      const memories = rows.map(([multiples]) => {
        const shown: ShownMemory = new Map();
        for (const m of multiples.slice(0, -1)) drawn(polygon(square), m * threshold, shown);
        return shown;
      });

      // Act
      const result = rows.map(([multiples], i) =>
        drawn(polygon(square), (multiples.at(-1) ?? 0) * threshold, memories[i] ?? new Map()),
      );

      // Assert
      expect(result).toEqual(rows.map(([, expected]) => expected));
    });

    it('names a line area at any scale', () => {
      // Arrange
      const scales = [0.01, 1000];

      // Act
      const shown = scales.map((scale) => drawn(line([0, 0], [4, 0]), scale, new Map()));

      // Assert
      expect(shown).toEqual([true, true]);
    });
  });
});
