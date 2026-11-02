import { describe, expect, it } from 'bun:test';

import { CHART_COLORS } from '../../design/palette';
import { type ChartItem, chartOf } from '../../lib/chart';
import type { ShownMemory } from '../../lib/fits';
import type { LabelDensity } from '../../lib/layers';
import { parseMapSet } from '../../lib/mapset';
import { EXAMPLE } from '../../lib/mapsetCorpus';
import type { Layer } from '../../lib/mapsetFormat';
import { atlas } from './atlasFixture';
import {
  type Extra,
  glyphs,
  itemOf,
  keyed,
  line,
  packed,
  partOf,
  polygon,
  type Position,
  sceneOf,
  type SceneOptions,
  segments,
  single,
  spelled,
} from './chartFixture';

/** The area labels of `chart`: the text and the rules. */
const areaLabels = (chart: Parameters<typeof sceneOf>[0], options: SceneOptions = {}) =>
  sceneOf(chart, options).areaLabels();

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

/** Whether the name is drawn at a settled scale, given what was shown before. */
const drawn = (shape: ReturnType<typeof polygon>, scale: number, shown: ShownMemory) => {
  const chart = [keyed('PAPAQ', itemOf('tma', partOf('tma', shape, { name: 'PAPAQ' })))];
  return areaLabels(chart, { scale, shown }).text.count > 0;
};

describe('the area labels', () => {
  it('centres the name on the pole, with a halo', () => {
    // Arrange
    const chart = [single('ctr', polygon(el))];
    const scale = 9 / atlas.fontSize;
    const half = (1 * atlas.advance * scale) / 2;

    // Act
    const { text } = areaLabels(chart);

    // Assert
    const [glyph] = glyphs(text);
    expect(glyph?.px).toBeCloseTo(-half - atlas.buffer * scale, 6);
    expect(glyph?.halo).toBeGreaterThan(0);
  });

  it('labels a stepped item once', () => {
    // Arrange
    const chart = chartOf([parseMapSet(EXAMPLE)]);

    // Act
    const { text } = areaLabels(chart, { layers: ['tma'] });

    // Assert
    expect(spelled(text)).toBe('PAPAQ240SFC');
  });

  it('writes a sector name at 10 px and the name of another area at 9 px', () => {
    // Arrange
    const rows: Layer[] = ['sector', 'ctr'];
    const chart = rows.map((layer) => keyed(layer, itemOf(layer, partOf(layer, polygon(el)))));

    // Act
    const heights = rows.map((layer) => glyphs(areaLabels(chart, { layers: [layer] }).text)[0]?.h);

    // Assert
    expect(heights).toEqual([
      (atlas.cellH * 10) / atlas.fontSize,
      (atlas.cellH * 9) / atlas.fontSize,
    ]);
  });

  it('gives a hidden area no name', () => {
    // Arrange
    const chart = [single('ctr', polygon(el))];

    // Act
    const { text } = areaLabels(chart, { hidden: ['ctr'] });

    // Assert
    expect(text.count).toBe(0);
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

const sector = (...parts: Extra[]) =>
  itemOf(
    'sector',
    ...parts.map((extra) => partOf('sector', polygon(el), { name: 'Z55', ...extra })),
  );

describe('the sector row of the area labels', () => {
  const z55 = sector({ freqs: ['134.65'], upper: 'FL375' }, { freqs: ['127.35'], lower: 'FL375' });
  const textOf = (item: ReturnType<typeof sector>, density: LabelDensity) =>
    glyphs(areaLabels([item], { layers: ['sector'], density }).text);

  it('adds the first frequency of the item at DENSE, in the detail colour and 9 px', () => {
    // Arrange
    const item = z55;

    // Act
    const rows = textOf(item, 'dense');

    // Assert
    expect(rows.map((g) => g.char).join('')).toBe('Z55134.65');
    expect(rows.slice(0, 3).every((g) => g.h === (atlas.cellH * 10) / atlas.fontSize)).toBe(true);
    expect(rows.slice(3).every((g) => g.h === (atlas.cellH * 9) / atlas.fontSize)).toBe(true);
    expect(rows[3]?.color).toEqual(packed(CHART_COLORS.sectorDetail));
    expect(rows[0]?.color).toEqual(packed(CHART_COLORS.sectorLabel));
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
    const rows: [ReturnType<typeof sector>, Layer, LabelDensity][] = [
      [z55, 'sector', 'normal'],
      [ctr, 'ctr', 'dense'],
    ];

    // Act
    const names = rows.map(([item, layer, density]) =>
      spelled(areaLabels([item], { layers: [layer], density }).text),
    );

    // Assert
    expect(names).toEqual(['Z55', 'Z55']);
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

describe('the fraction of an area label', () => {
  const size = 8;
  const example = chartOf([parseMapSet(EXAMPLE)]);

  it('writes the upper limit over the lower, a rule as wide as the wider between, the block centred', () => {
    // Arrange
    const options: SceneOptions = { layers: ['tma'] };

    // Act
    const { text, rules } = areaLabels(example, options);

    // Assert
    const rows = glyphs(text);
    const [name, upper, lower] = [rows.slice(0, 5), rows.slice(5, 8), rows.slice(8, 11)];
    expect(spelled(text)).toBe('PAPAQ240SFC');
    expect(centreOf(name[0] ?? { py: NaN }, 9)).toBeCloseTo(-10.5, 6);
    expect(centreOf(upper[0] ?? { py: NaN }, size)).toBeCloseTo(-0.5, 6);
    expect(centreOf(lower[0] ?? { py: NaN }, size)).toBeCloseTo(10.5, 6);
    expect(upper.every((g) => g.color.join() === packed('#8a5050').join())).toBe(true);
    const [rule] = segments(rules);
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
    const layers: Layer[] = ['ctr', 'dng', 'pr', 'tra', 'cta', 'advisory', 'civt', 'asr'];

    // Act
    const { text } = areaLabels(example, { layers });

    // Assert
    expect(spelled(text)).toContain('PAPAQ030SFC');
    expect(spelled(text)).toContain('XQR-927120SFC');
    expect(spelled(text)).toContain('D-901350SFC');
  });

  it('makes the rule as wide as the wider limit', () => {
    // Arrange
    const chart = [
      single('ctr', polygon(el), { name: 'LOW', lower: '1500FT AGL', upper: 'FL240' }),
    ];

    // Act
    const { text, rules } = areaLabels(chart);

    // Assert
    const [rule] = segments(rules);
    expect(spelled(text)).toBe('LOW240015AGL');
    expect((rule?.offsetB.x ?? 0) - (rule?.offsetA.x ?? 0)).toBeCloseTo(
      (7 * atlas.advance * size) / atlas.fontSize,
      6,
    );
  });

  it('gives an area with no limits its name alone, and no rule', () => {
    // Arrange
    const chart = [single('ctr', polygon(el), { name: 'FREE' })];

    // Act
    const { text, rules } = areaLabels(chart);

    // Assert
    expect(spelled(text)).toBe('FREE');
    expect(rules.count).toBe(0);
  });

  it('gives a sector no fraction', () => {
    // Arrange
    const chart = [single('sector', polygon(el), { name: 'Z55', upper: 'FL335' })];

    // Act
    const { text, rules } = areaLabels(chart);

    // Assert
    expect(spelled(text)).toBe('Z55335−');
    expect(rules.count).toBe(0);
  });
});

/** A one-part sector item of a ring and limits. */
const stratum = (name: string, ring: Position[], extra: Extra) =>
  keyed(name, itemOf('sector', partOf('sector', polygon(ring), { name, ...extra })));

describe('the stacks of area labels', () => {
  /** The same L ring, listed from another vertex. */
  const turnedEl = [...el.slice(2, -1), ...el.slice(0, 2), el[2] ?? [0, 0]];
  const low = stratum('LOW', el, { upper: 'FL335' });
  const high = stratum('HIGH', turnedEl, { lower: 'FL335' });
  const fitting: SceneOptions = { density: 'normal', scale: 2 };
  const rows = (items: ReturnType<typeof stratum>[], density: LabelDensity = 'normal') =>
    glyphs(areaLabels(items, { layers: ['sector'], density }).text);

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

  it('lights each member of a stack on its own rows, at its stacked offset', () => {
    // Arrange
    const scene = sceneOf([high, low], { layers: ['sector'], density: 'normal' });

    // Act
    const [lit, other] = [low, high].map((item) => glyphs(scene.highlight(item).text));

    // Assert
    expect(centreOf(lit?.[0] ?? { py: NaN }, 10)).toBeCloseTo(-6, 6);
    expect(centreOf(other?.[0] ?? { py: NaN }, 10)).toBeCloseTo(6, 6);
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
    const countOf = (items: ReturnType<typeof stratum>[]) =>
      areaLabels(items, { ...fitting, layers: ['sector'] }).text.count;
    // Precondition: the short name alone fits
    const alone = [shortHigh, shortLow].map((s) => countOf([s]));

    // Act
    const stacked = pairs.map(countOf);

    // Assert
    expect(alone.every((n) => n > 0)).toBe(true);
    expect(stacked).toEqual([0, 0]);
  });

  it('places no item of a layer whose density is not reached', () => {
    // Arrange
    const chart = [
      single('tma', polygon(el), { name: 'DENSE ONLY' }, 'tma'),
      single('sector', polygon(el), { name: 'NORMAL' }, 'sector'),
    ];
    const placed: string[] = [];
    const placeOf = (item: ChartItem) => {
      placed.push(item.key);
      return undefined;
    };

    // Act
    areaLabels(chart, { density: 'normal', placeOf });

    // Assert
    expect(placed).toEqual(['sector']);
  });
});
