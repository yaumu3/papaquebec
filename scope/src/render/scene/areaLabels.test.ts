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
  instances,
  itemOf,
  keyed,
  line,
  packed,
  partOf,
  polygon,
  type Position,
  project,
} from './chartFixture';
import { THEME } from './rules';

/** The text and the rules of the area labels of `items` as the scope builds them. */
function built(
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
  const [text, rules] = buildAreaLabels({
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
  if (!text || !rules) throw new Error('buildAreaLabels returned too few batches');
  return { text, rules };
}

/** The text of the area labels of `items`. */
const build = (...args: Parameters<typeof built>) => built(...args).text;

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

/** An L-shaped ring. */
const el: Position[] = [
  [0, 0],
  [6, 0],
  [6, 2],
  [2, 2],
  [2, 6],
  [0, 6],
  [0, 0],
];

describe('buildAreaLabels', () => {
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
    expect(names.join('')).toBe('PAPAQ240SFC');
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

const sector = (...parts: Parameters<typeof partOf>[2][]) =>
  itemOf(
    'sector',
    ...parts.map((extra) => partOf('sector', polygon(el), { name: 'Z55', ...extra })),
  );

describe('the sector row of buildAreaLabels', () => {
  const z55 = sector({ freqs: ['134.65'], upper: 'FL375' }, { freqs: ['127.35'], lower: 'FL375' });
  const textOf = (item: ReturnType<typeof sector>, density: LabelDensity) =>
    glyphs(build([item], ['sector'], density));

  it('adds the first frequency of the item at DENSE, in the detail colour and 9 px', () => {
    // Arrange
    const item = z55;

    // Act
    const rows = textOf(item, 'dense');

    // Assert
    expect(rows.map((g) => g.char).join('')).toBe('Z55134.65');
    expect(rows.slice(0, 3).every((g) => g.h === (atlas.cellH * 10) / atlas.fontSize)).toBe(true);
    expect(rows.slice(3).every((g) => g.h === (atlas.cellH * 9) / atlas.fontSize)).toBe(true);
    expect(rows[3]?.color).toEqual(packed(THEME.sectorDetail));
    expect(rows[0]?.color).toEqual(packed(THEME.sectorLabel));
  });

  it('sets the frequency 6 px after the name, the whole row centred', () => {
    // Arrange
    const item = z55;
    const name = (3 * atlas.advance * 10) / atlas.fontSize;
    const detail = (6 * atlas.advance * 9) / atlas.fontSize;

    // Act
    const rows = textOf(item, 'dense');

    // Assert
    const first = rows[0];
    const freq = rows[3];
    expect(
      (freq?.px ?? 0) +
        (atlas.buffer * 9) / atlas.fontSize -
        ((first?.px ?? 0) + (atlas.buffer * 10) / atlas.fontSize),
    ).toBeCloseTo(name + 6, 6);
    expect((first?.px ?? 0) + (atlas.buffer * 10) / atlas.fontSize).toBeCloseTo(
      -(name + 6 + detail) / 2,
      6,
    );
  });

  it('adds the stratum, with its minus drawn, and leaves out what the item lacks', () => {
    // Arrange
    const below = sector({ upper: 'FL335' });
    const both = sector({ freqs: ['118.05'], upper: 'FL335' });

    // Act
    const [only, withFreq] = [below, both].map((item) => textOf(item, 'dense'));

    // Assert
    expect(only?.map((g) => g.char).join('')).toBe('Z55335−');
    expect(withFreq?.map((g) => g.char).join('')).toBe('Z55118.05335−');
  });

  it('writes the name alone below DENSE, and for an area that is not a sector', () => {
    // Arrange
    const ctr = itemOf('ctr', partOf('ctr', polygon(el), { name: 'Z55' }));

    // Act
    const normal = textOf(z55, 'normal');
    const other = glyphs(build([ctr], ['ctr'], 'dense'));

    // Assert
    expect(normal.map((g) => g.char).join('')).toBe('Z55');
    expect(other.map((g) => g.char).join('')).toBe('Z55');
  });

  it('takes the frequency of the first part that has one', () => {
    // Arrange
    const item = sector({}, { freqs: ['127.35'] }, { freqs: ['134.65'] });

    // Act
    const rows = textOf(item, 'dense');

    // Assert
    expect(rows.map((g) => g.char).join('')).toBe('Z55127.35');
  });
});

/** The CSS px below the pole of the centre of a glyph set in `px` size. */
const centreOf = (g: { py: number }, px: number) =>
  g.py + (atlas.cellH * px) / (2 * atlas.fontSize);

describe('the fraction of buildAreaLabels', () => {
  const size = 8;
  const example = chartOf([parseMapSet(EXAMPLE)]);

  it('writes the upper limit over the lower, a rule as wide as the wider between, the block centred', () => {
    // Arrange
    const layers: StyledLayer[] = ['tma'];

    // Act
    const { text, rules } = built(example, layers);

    // Assert
    const rows = glyphs(text);
    const [name, upper, lower] = [rows.slice(0, 5), rows.slice(5, 8), rows.slice(8, 11)];
    expect(rows.map((g) => g.char).join('')).toBe('PAPAQ240SFC');
    expect(centreOf(name[0] ?? { py: NaN }, 9)).toBeCloseTo(-10.5, 6);
    expect(centreOf(upper[0] ?? { py: NaN }, size)).toBeCloseTo(-0.5, 6);
    expect(centreOf(lower[0] ?? { py: NaN }, size)).toBeCloseTo(10.5, 6);
    expect(upper.every((g) => g.color.join() === packed('#8a5050').join())).toBe(true);
    const [rule] = instances(rules);
    expect(rules.count).toBe(1);
    expect(rule?.offsetA.y).toBeCloseTo(5, 6);
    expect(rule?.offsetB.y).toBeCloseTo(5, 6);
    expect((rule?.offsetB.x ?? 0) - (rule?.offsetA.x ?? 0)).toBeCloseTo(
      (3 * atlas.advance * size) / atlas.fontSize,
      6,
    );
    expect(rule?.width).toBe(1);
    expect(rule?.color).toEqual(packed('#8a5050'));
  });

  it('writes each limit in hundreds of feet', () => {
    // Arrange
    const layers: StyledLayer[] = ['ctr', 'dng', 'pr', 'tra', 'cta', 'advisory', 'civt', 'asr'];

    // Act
    const { text } = built(example, layers);

    // Assert
    const all = glyphs(text)
      .map((g) => g.char)
      .join('');
    expect(all).toContain('PAPAQ030SFC');
    expect(all).toContain('XQR-927120SFC');
    expect(all).toContain('D-901350SFC');
  });

  it('makes the rule as wide as the wider limit', () => {
    // Arrange
    const items = [
      itemOf(
        'ctr',
        partOf('ctr', polygon(el), { name: 'LOW', lower: '1500FT AGL', upper: 'FL240' }),
      ),
    ];

    // Act
    const { text, rules } = built(items, ['ctr']);

    // Assert
    const [rule] = instances(rules);
    expect(
      glyphs(text)
        .map((g) => g.char)
        .join(''),
    ).toBe('LOW240015AGL');
    expect((rule?.offsetB.x ?? 0) - (rule?.offsetA.x ?? 0)).toBeCloseTo(
      (7 * atlas.advance * size) / atlas.fontSize,
      6,
    );
  });

  it('gives an area with no limits its name alone, and no rule', () => {
    // Arrange
    const items = [itemOf('ctr', partOf('ctr', polygon(el), { name: 'FREE' }))];

    // Act
    const { text, rules } = built(items, ['ctr']);

    // Assert
    expect(
      glyphs(text)
        .map((g) => g.char)
        .join(''),
    ).toBe('FREE');
    expect(rules.count).toBe(0);
  });

  it('gives a sector no fraction', () => {
    // Arrange
    const sectorItem = itemOf(
      'sector',
      partOf('sector', polygon(el), { name: 'Z55', upper: 'FL335' }),
    );

    // Act
    const { text, rules } = built([sectorItem], ['sector']);

    // Assert
    expect(
      glyphs(text)
        .map((g) => g.char)
        .join(''),
    ).toBe('Z55335−');
    expect(rules.count).toBe(0);
  });
});

/** A one-part sector item of a ring and limits. */
const stratum = (name: string, ring: Position[], extra: { lower?: string; upper?: string }) =>
  keyed(name, itemOf('sector', partOf('sector', polygon(ring), { name, ...extra })));

/** A settled scale of 2 with nothing remembered yet. */
const fit = (): FitInput => ({ settledScale: () => 2, shown: new Map() });

describe('the stacks of buildAreaLabels', () => {
  /** The same L ring, listed from another vertex. */
  const turnedEl = [...el.slice(2, -1), ...el.slice(0, 2), el[2] ?? [0, 0]];
  const low = stratum('LOW', el, { upper: 'FL335' });
  const high = stratum('HIGH', turnedEl, { lower: 'FL335' });
  const rows = (items: ReturnType<typeof stratum>[], density: LabelDensity = 'normal') =>
    glyphs(build(items, ['sector'], density));

  it('puts the strata of one footprint one over the other, the lowest on top, centred on the pole', () => {
    // Arrange
    const items = [high, low];

    // Act
    const glyphsOf = rows(items);

    // Assert
    expect(glyphsOf.map((g) => g.char).join('')).toBe('LOWHIGH');
    const lowRow = glyphsOf[0];
    const highRow = glyphsOf[3];
    expect(centreOf(lowRow ?? { py: NaN }, 10)).toBeCloseTo(-6, 6);
    expect(centreOf(highRow ?? { py: NaN }, 10)).toBeCloseTo(6, 6);
    expect(lowRow?.at).toEqual(highRow?.at);
  });

  it('orders them by their lower limit, whatever their upper limits are', () => {
    // Arrange
    const wide = stratum('WIDE', el, { upper: 'FL400' });
    const narrow = stratum('NARROW', el, { lower: 'FL100', upper: 'FL200' });

    // Act
    const glyphsOf = rows([narrow, wide]);

    // Assert
    expect(glyphsOf.map((g) => g.char).join('')).toBe('WIDENARROW');
  });

  it('leaves a stratum of another footprint where it stands', () => {
    // Arrange
    const apart = stratum(
      'APART',
      [
        [10, 10],
        [14, 10],
        [14, 14],
        [10, 14],
        [10, 10],
      ],
      {},
    );

    // Act
    const glyphsOf = rows([low, high, apart]);

    // Assert
    const apartRow = glyphsOf.filter((g) => g.at.x > 5);
    expect(apartRow.map((g) => g.char).join('')).toBe('APART');
    expect(centreOf(apartRow[0] ?? { py: NaN }, 10)).toBeCloseTo(0, 6);
  });

  it('shows or hides the pair as one, on the width of the widest, low or high', () => {
    // Arrange
    const longLow = stratum('LONGNAME', el, { upper: 'FL335' });
    const shortHigh = stratum('S2', turnedEl, { lower: 'FL335' });
    const shortLow = stratum('S2', el, { upper: 'FL335' });
    const longHigh = stratum('LONGNAME', turnedEl, { lower: 'FL335' });
    const pairs = [
      [longLow, shortHigh],
      [shortLow, longHigh],
    ];
    // Precondition: the short name alone fits
    const alone = [shortHigh, shortLow].map(
      (s) => build([s], ['sector'], 'normal', [], fit()).count,
    );

    // Act
    const stacked = pairs.map((pair) => build(pair, ['sector'], 'normal', [], fit()).count);

    // Assert
    expect(alone.every((n) => n > 0)).toBe(true);
    expect(stacked).toEqual([0, 0]);
  });
});
