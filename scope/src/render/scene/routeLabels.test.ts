import { describe, expect, it } from 'bun:test';

import { type Chart, chartOf, itemName } from '../../lib/chart';
import type { ShownMemory } from '../../lib/fits';
import { DRAW_STACK, drawnItemsOf, isStyled, type StyledLayer } from '../../lib/layers';
import { parseMapSet } from '../../lib/mapset';
import { EXAMPLE } from '../../lib/mapsetCorpus';
import type { Layer } from '../../lib/mapsetFormat';
import { drawnPointsOf, topologyOf } from '../../lib/topology';
import type { LayerState } from '../../lib/visibility';
import { allShown, shownExcept } from '../../lib/visibilityFixture';
import { LABEL_DENSITIES, type LabelDensity } from '../../state/settingsDefaults';
import { atlas } from './atlasFixture';
import type { FitInput } from './chart';
import {
  airway,
  glyphs,
  instances,
  itemOf,
  keyed,
  line,
  packed,
  partOf,
  point,
  project,
  redrawn,
  withoutColor,
} from './chartFixture';
import { buildRouteLabels } from './routeLabels';
import { THEME } from './rules';

const ALL_LAYERS = DRAW_STACK.filter(isStyled);

/** The route labels of `items` as the scope builds them. */
function build(
  items: Chart,
  layers: readonly StyledLayer[],
  labelDensity: LabelDensity = 'dense',
  stateOf: (layer: Layer) => LayerState = allShown,
  fit: FitInput = { settledScale: () => 1000, shown: new Map() },
) {
  const topology = topologyOf(items);
  const drawnItems = drawnItemsOf(items, layers, stateOf, () => true);
  const drawnPoints = () => drawnPointsOf(topology, drawnItems);
  const {
    batches: [gaps, text, chevrons],
    drawn,
  } = buildRouteLabels({
    topology,
    drawnPoints,
    project,
    layers,
    drawnItems,
    labelDensity,
    atlas,
    ...fit,
  });
  if (!gaps || !text || !chevrons) throw new Error('buildRouteLabels returned too few batches');
  return { gaps, text, chevrons, drawn };
}

/** The labels of a text batch: the glyphs that share an anchor, read in order. */
function labelsIn(text: Parameters<typeof glyphs>[0]) {
  const labels: {
    text: string;
    at: { x: number; y: number };
    glyphs: ReturnType<typeof glyphs>;
  }[] = [];
  for (const glyph of glyphs(text)) {
    const last = labels.at(-1);
    if (last && last.at.x === glyph.at.x && last.at.y === glyph.at.y) {
      last.text += glyph.char;
      last.glyphs.push(glyph);
    } else {
      labels.push({ text: glyph.char, at: glyph.at, glyphs: [glyph] });
    }
  }
  return labels;
}

const stops = (layer: 'navaid' | 'fix', x: number) =>
  keyed(`${layer}${x}`, itemOf(layer, partOf(layer, point([x, 0]))));

const oneWay = (layer: StyledLayer, name: string, ...at: [number, number][]) =>
  keyed(name, itemOf(layer, partOf(layer, line(...at), { name, oneWay: true })));

/** CSS px a run of `n` characters takes at 9 px in the fixture's atlas. */
const widthOf = (n: number) => (n * atlas.advance * 9) / atlas.fontSize;

/** The chevrons of a batch in their label's frame (turned back by `angle`): each tip and the x of its arms. */
function chevronsIn(batch: Parameters<typeof instances>[0], angle: number) {
  const frame = ({ x, y }: { x: number; y: number }) => ({
    x: x * Math.cos(angle) + y * Math.sin(angle),
    y: -x * Math.sin(angle) + y * Math.cos(angle),
  });
  const segments = instances(batch);
  return Array.from({ length: segments.length / 2 }, (_, i) => {
    const [arm, other] = [segments[2 * i], segments[2 * i + 1]];
    return {
      tip: frame(arm?.offsetB ?? { x: 0, y: 0 }),
      arm: frame(arm?.offsetA ?? { x: 0, y: 0 }),
      otherArm: frame(other?.offsetA ?? { x: 0, y: 0 }),
      width: arm?.width,
      color: arm?.color,
      at: arm?.a,
    };
  });
}

/** CSS px a label of one-way designators of these lengths takes, chevrons and separators included. */
const oneWayTotal = (...names: number[]) =>
  names.reduce((sum, n) => sum + widthOf(n) + 10, 0) + 9 * (names.length - 1);

describe('buildRouteLabels', () => {
  const west = airway('conv', 'V901', [3, 1], [1, 0.5], [0, 0.25]);

  it('centres a label on the middle of its span, along it and upright', () => {
    // Arrange
    const items = [west];

    // Act
    const { text } = build(items, ['conv']);

    // Assert
    const [label] = labelsIn(text);
    expect(label?.text).toBe('V901');
    expect(label?.at.x).toBeCloseTo(1.5, 6);
    expect(label?.at.y).toBeCloseTo(0.625, 6);
    expect(label?.glyphs[0]?.angle).toBeCloseTo(-Math.atan(0.25), 6);
    expect(label?.glyphs.map((g) => g.px)).toEqual(
      label?.glyphs.map((g) => g.px).toSorted((a, b) => a - b),
    );
    expect(label?.glyphs.every((g) => g.halo > 0)).toBe(true);
  });

  it('cuts a gap in the line: a box of the background, 12 px tall, 4 px past the text each side', () => {
    // Arrange
    const items = [west];

    // Act
    const { gaps, text } = build(items, ['conv']);

    // Assert
    const [gap] = instances(gaps);
    const angle = glyphs(text)[0]?.angle ?? NaN;
    const along = Math.atan2(
      (gap?.offsetB.y ?? 0) - (gap?.offsetA.y ?? 0),
      (gap?.offsetB.x ?? 0) - (gap?.offsetA.x ?? 0),
    );
    expect(gaps.count).toBe(1);
    expect(gap?.width).toBe(12);
    expect(gap?.color).toEqual(packed(THEME.bg));
    expect(
      Math.hypot(
        (gap?.offsetB.x ?? 0) - (gap?.offsetA.x ?? 0),
        (gap?.offsetB.y ?? 0) - (gap?.offsetA.y ?? 0),
      ),
    ).toBeCloseTo(widthOf(4) + 8, 6);
    expect((gap?.offsetA.x ?? 0) + (gap?.offsetB.x ?? 0)).toBeCloseTo(0, 6);
    expect(along).toBeCloseTo(angle, 6);
    expect(gap?.a).toEqual(gap?.b);
  });

  it('labels a span shared by several routes once, each designator in its layer colour', () => {
    // Arrange
    const items = chartOf([parseMapSet(EXAMPLE)]);

    // Act
    const { text } = build(items, ALL_LAYERS);

    // Assert
    const labels = labelsIn(text);
    const shared = labels.find((l) => l.text === 'V901Y902');
    expect(shared?.glyphs.map((g) => g.color)).toEqual([
      ...Array(4).fill(packed('#9a6a4c')),
      ...Array(4).fill(packed('#4a8090')),
    ]);
    expect(
      labels
        .filter((l) => l.text.includes('V901'))
        .map((l) => l.text)
        .toSorted(),
    ).toEqual(['A901V901Y902', 'V901Y902']);
  });

  it('keeps a conventional and an RNAV airway of one designator apart', () => {
    // Arrange
    const items = [airway('conv', 'X1', [0, 0], [2, 0]), airway('rnav', 'X1', [0, 0], [2, 0])];

    // Act
    const { text } = build(items, ['conv', 'rnav']);

    // Assert
    const [label] = labelsIn(text);
    expect(label?.text).toBe('X1X1');
    expect(label?.glyphs.map((g) => g.color)).toEqual([
      ...Array(2).fill(packed('#9a6a4c')),
      ...Array(2).fill(packed('#4a8090')),
    ]);
  });

  it('labels a route once between its drawn stops, whatever fixes lie between', () => {
    // Arrange
    const items = [
      airway('conv', 'V901', [0, 0], [1, 0], [2, 0]),
      stops('navaid', 0),
      stops('fix', 1),
      stops('navaid', 2),
    ];
    const rows: StyledLayer[][] = [
      ['conv', 'navaid'],
      ['conv', 'navaid', 'fix'],
    ];

    // Act
    const counts = rows.map((layers) => labelsIn(build(items, layers).text).length);

    // Assert
    expect(counts).toEqual([1, 2]);
  });

  it('gives a hidden route no label', () => {
    // Arrange
    const items = [west];

    // Act
    const { text } = build(items, ['conv'], 'dense', () => shownExcept('V901'));

    // Assert
    expect(text.count).toBe(0);
  });

  it('labels a route from its density, a procedure too, and never a direct route', () => {
    // Arrange
    const rows: [StyledLayer, number[]][] = [
      ['conv', [0, 0, 1, 1]],
      ['rnav', [0, 0, 1, 1]],
      ['trans', [0, 0, 1, 1]],
      ['sid', [0, 0, 0, 1]],
      ['star', [0, 0, 0, 1]],
      ['dct', [0, 0, 0, 0]],
    ];

    // Act
    const counts = rows.map(([layer]) =>
      LABEL_DENSITIES.map((density): number => {
        const item = airway(layer, 'Q', [0, 0], [1, 0]);
        return build([item], [layer], density).text.count > 0 ? 1 : 0;
      }),
    );

    // Assert
    expect(counts).toEqual(rows.map(([, expected]) => expected));
  });

  it('shows a label from its threshold, hides it below, and keeps its state between', () => {
    // Arrange
    const items = [stops('navaid', 0), airway('conv', 'V901', [0, 0], [2, 0])];
    const layers: StyledLayer[] = ['conv', 'navaid'];
    const threshold = widthOf(4) + 28;
    const cut = 10 / 2 + 3;
    const scaleOf = (multiple: number) => (multiple * threshold + cut) / 2;
    const rows: [number[], boolean][] = [
      [[1.01], true],
      [[0.99], false],
      [[1.2, 1.05], true],
      [[1.2, 1.05, 0.99], false],
      [[0.99, 1.05], false],
      [[0.99, 1.05, 1.2], true],
    ];
    const memories = rows.map(([multiples]) => {
      const shown: ShownMemory = new Map();
      for (const multiple of multiples.slice(0, -1)) {
        build(items, layers, 'dense', allShown, { settledScale: () => scaleOf(multiple), shown });
      }
      return shown;
    });

    // Act
    const drawn = rows.map(([multiples], i) => {
      const settledScale = () => scaleOf(multiples.at(-1) ?? 0);
      const shown = memories[i] ?? new Map();
      return build(items, layers, 'dense', allShown, { settledScale, shown }).text.count > 0;
    });

    // Assert
    expect(drawn).toEqual(rows.map(([, expected]) => expected));
  });

  describe('a procedure', () => {
    const sid = airway('sid', 'SID1', [0, 0], [0.5, 0], [2, 0], [4, 0]);
    const fixes = [stops('fix', 0.5), stops('fix', 2)];
    const layers: StyledLayer[] = ['sid', 'fix'];
    const named = (scale: number) =>
      labelsIn(
        build([sid, ...fixes], layers, 'dense', allShown, {
          settledScale: () => scale,
          shown: new Map(),
        }).text,
      );

    it('is named once, on the first of its spans that has room', () => {
      // Arrange
      const roomyFrom2 = 40;

      // Act
      const labels = named(roomyFrom2);

      // Assert
      expect(labels.map((l) => l.text)).toEqual(['SID1']);
      expect(labels[0]?.at.x).toBeCloseTo(1.25, 6);
    });

    it('is not named when no span has room', () => {
      // Arrange
      const tight = 10;

      // Act
      const labels = named(tight);

      // Assert
      expect(labels).toEqual([]);
    });

    it('joins the label of an airway on the same span, in draw-stack order', () => {
      // Arrange
      const items = chartOf([parseMapSet(EXAMPLE)]);

      // Act
      const { text } = build(items, ALL_LAYERS);

      // Assert
      const joined = labelsIn(text).find((l) => l.text === 'TAVRO2.ZOLEKA901');
      expect(joined?.glyphs.map((g) => g.color)).toEqual([
        ...Array(12).fill(packed('#40707c')),
        ...Array(4).fill(packed('#9a6a4c')),
      ]);
    });

    it('does not take the room of an airway label that already fits', () => {
      // Arrange
      const items = [airway('conv', 'V901', [0, 0], [2, 0]), airway('sid', 'SID1', [0, 0], [2, 0])];
      const scale = (2 * widthOf(4) + 9 + 28 - 1) / 2;

      // Act
      const { text } = build(items, ['conv', 'sid'], 'dense', allShown, {
        settledScale: () => scale,
        shown: new Map(),
      });

      // Assert
      expect(labelsIn(text).map((l) => l.text)).toEqual(['V901']);
    });

    describe('on a span of airways', () => {
      const items = [
        airway('conv', 'V901', [0, 0], [2, 0]),
        airway('conv', 'V902', [0, 0], [2, 0]),
        airway('sid', 'S1', [0, 0], [2, 0]),
      ];
      const airwayT = 2 * widthOf(4) + 9 + 28;
      const textAt = (multiple: number, shown: ShownMemory) =>
        labelsIn(
          build(items, ['conv', 'sid'], 'dense', allShown, {
            settledScale: () => (multiple * airwayT) / 2,
            shown,
          }).text,
        ).map((l) => l.text);

      it('is not named alone where the airways do not fit', () => {
        // Arrange
        const shown: ShownMemory = new Map();

        // Act
        const drawn = textAt(0.9, shown);

        // Assert
        expect(drawn).toEqual([]);
      });

      it('draws the same label on every build at one settled scale, airway or not', () => {
        // Arrange
        const rows: [number[], string[]][] = [
          [[0.5, 1.05, 1.05], []],
          [[1.2, 1.05, 1.05], ['V901V902']],
        ];
        const memories = rows.map((): ShownMemory => new Map());
        const firsts = rows.map(([history], i) =>
          history
            .slice(0, -1)
            .map((multiple) => textAt(multiple, memories[i] ?? new Map()))
            .at(-1),
        );

        // Act
        const drawn = rows.map(([history], i) =>
          textAt(history.at(-1) ?? NaN, memories[i] ?? new Map()),
        );

        // Assert
        const expected = rows.map(([, e]) => e);
        expect(firsts).toEqual(expected);
        expect(drawn).toEqual(expected);
      });
    });
  });

  describe('a one-way designator', () => {
    it('has a chevron after it where its route is flown along the reading, and before it, pointing back, where it is flown against', () => {
      // Arrange
      const w = widthOf(4);
      const rows: [Chart, { tipX: number; armX: number }[]][] = [
        [
          [oneWay('conv', 'V901', [0, 0], [2, 0])],
          [{ tipX: -(w + 10) / 2 + w + 9, armX: -(w + 10) / 2 + w + 4 }],
        ],
        [
          [oneWay('conv', 'V901', [2, 0], [0, 0])],
          [{ tipX: -(w + 10) / 2 + 1, armX: -(w + 10) / 2 + 6 }],
        ],
      ];

      // Act
      const found = rows.map(([items]) => {
        const { text, chevrons } = build(items, ['conv']);
        return chevronsIn(chevrons, glyphs(text)[0]?.angle ?? NaN);
      });

      // Assert
      found.forEach((chevs, i) => {
        const [expected] = rows[i]?.[1] ?? [];
        expect(chevs).toHaveLength(1);
        expect(chevs[0]?.tip.x).toBeCloseTo(expected?.tipX ?? NaN, 6);
        expect(chevs[0]?.arm.x).toBeCloseTo(expected?.armX ?? NaN, 6);
        expect(chevs[0]?.otherArm.x).toBeCloseTo(expected?.armX ?? NaN, 6);
        expect(chevs[0]?.arm.y).toBeCloseTo(-3.5, 6);
        expect(chevs[0]?.otherArm.y).toBeCloseTo(3.5, 6);
        expect(chevs[0]?.tip.y).toBeCloseTo(0, 6);
        expect(chevs[0]?.width).toBeCloseTo(1.3, 5);
      });
    });

    it('is read per designator when two share a span, in the colour of each', () => {
      // Arrange
      const items = [oneWay('conv', 'A1', [0, 0], [2, 0]), oneWay('rnav', 'B1', [2, 0], [0, 0])];
      const w = widthOf(2);
      const start = -oneWayTotal(2, 2) / 2;

      // Act
      const { text, chevrons } = build(items, ['conv', 'rnav']);

      // Assert
      const [first, second] = chevronsIn(chevrons, glyphs(text)[0]?.angle ?? NaN);
      expect(first?.tip.x).toBeCloseTo(start + w + 9, 6);
      expect(second?.tip.x).toBeCloseTo(start + w + 19 + 1, 6);
      expect(first?.color).toEqual(packed('#9a6a4c'));
      expect(second?.color).toEqual(packed('#4a8090'));
    });

    it('is flown along the reading on TAVRO-ZOLEK and against it on the way into QDG', () => {
      // Arrange
      const items = chartOf([parseMapSet(EXAMPLE)]);

      // Act
      const { text, chevrons } = build(items, ALL_LAYERS);

      // Assert
      const label = (name: string) => labelsIn(text).find((l) => l.text === name);
      const joined = label('TAVRO2.ZOLEKA901');
      const y903 = label('Y903');
      const ofLabel = (l: typeof joined) =>
        chevronsIn(chevrons, l?.glyphs[0]?.angle ?? NaN).filter(
          (c) => c.at?.x === l?.at.x && c.at?.y === l?.at.y,
        );
      expect(ofLabel(joined)).toHaveLength(2);
      expect(ofLabel(joined).every((c) => c.tip.x > c.arm.x)).toBe(true);
      expect(ofLabel(y903)).toHaveLength(1);
      expect(ofLabel(y903).every((c) => c.tip.x < c.arm.x)).toBe(true);
    });

    it('takes 10 px more room than the same designator without it', () => {
      // Arrange
      const threshold = widthOf(4) + 28;
      const scale = (1.05 * threshold) / 2;
      const fit = { settledScale: () => scale, shown: new Map() };
      const routes = [
        airway('conv', 'V901', [0, 0], [2, 0]),
        oneWay('conv', 'V901', [0, 0], [2, 0]),
      ];

      // Act
      const drawn = routes.map(
        (route) => build([route], ['conv'], 'dense', allShown, fit).text.count,
      );

      // Assert
      expect(drawn.map((n) => n > 0)).toEqual([true, false]);
    });
  });
});

describe('what buildRouteLabels records', () => {
  const shared = [airway('conv', 'V901', [0, 0], [2, 0]), airway('rnav', 'Y902', [0, 0], [2, 0])];

  it('redraws exactly the text and the chevrons it drew', () => {
    // Arrange
    const items = chartOf([parseMapSet(EXAMPLE)]);
    const { text, chevrons, drawn } = build(items, ALL_LAYERS);

    // Act
    const again = redrawn(drawn);

    // Assert
    expect(chevrons.count).toBeGreaterThan(0);
    expect(withoutColor(glyphs(again.text))).toEqual(withoutColor(glyphs(text)));
    expect(withoutColor(instances(again.strokes))).toEqual(withoutColor(instances(chevrons)));
  });

  it('keeps each designator of a shared span under its own item, at its own pen', () => {
    // Arrange
    const { drawn } = build(shared, ['conv', 'rnav']);

    // Act
    const [conv, rnav] = ['V901', 'Y902'].map((key) => drawn.get(key));

    // Assert
    expect(conv?.texts.map((t) => t.text)).toEqual(['V901']);
    expect(rnav?.texts.map((t) => t.text)).toEqual(['Y902']);
    expect(conv?.texts[0]?.at).toMatchObject({ x: 1, y: 0 });
    expect(rnav?.texts[0]?.at).toMatchObject({ x: 1, y: 0 });
    expect(conv?.texts[0]?.at.px).toBeLessThan(rnav?.texts[0]?.at.px ?? NaN);
  });

  it("keeps a procedure's name and both arms of its chevron under its item", () => {
    // Arrange
    const items = chartOf([parseMapSet(EXAMPLE)]);
    const key = items.find((item) => itemName(item) === 'TAVRO2.ZOLEK')?.key ?? '';
    const { drawn } = build(items, ALL_LAYERS);

    // Act
    const record = drawn.get(key);

    // Assert
    expect(record?.texts.map((t) => t.text)).toEqual(['TAVRO2.ZOLEK']);
    expect(record?.strokes).toHaveLength(2);
  });

  it("keeps a designator's own gap, the chart's for a lone one", () => {
    // Arrange
    const { gaps, drawn } = build([airway('conv', 'V901', [3, 1], [1, 0.5], [0, 0.25])], ['conv']);

    // Act
    const [kept] = drawn.get('V901')?.gaps ?? [];

    // Assert
    const [cut] = instances(gaps);
    expect(kept?.width).toBe(cut?.width ?? NaN);
    expect(kept?.color).toBe(THEME.bg);
    expect(kept?.from.x).toBeCloseTo(cut?.a.x ?? NaN, 9);
    expect(kept?.from.px).toBeCloseTo(cut?.offsetA.x ?? NaN, 4);
    expect(kept?.from.py).toBeCloseTo(cut?.offsetA.y ?? NaN, 4);
    expect(kept?.to.px).toBeCloseTo(cut?.offsetB.x ?? NaN, 4);
    expect(kept?.to.py).toBeCloseTo(cut?.offsetB.y ?? NaN, 4);
  });

  it("ends a designator's gap before the next designator's text", () => {
    // Arrange
    const { drawn } = build(shared, ['conv', 'rnav']);

    // Act
    const [conv, rnav] = ['V901', 'Y902'].map((key) => drawn.get(key));

    // Assert
    expect(conv?.gaps).toHaveLength(1);
    expect(conv?.gaps[0]?.to.px).toBeLessThan(rnav?.texts[0]?.at.px ?? NaN);
    expect(rnav?.gaps[0]?.from.px).toBeGreaterThan(conv?.texts[0]?.at.px ?? NaN);
  });
});
