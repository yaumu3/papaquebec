import { describe, expect, it } from 'bun:test';

import { PALETTE } from '../../design/palette';
import { type Chart, chartOf } from '../../lib/chart';
import type { ShownMemory } from '../../lib/fits';
import { parseMapSet } from '../../lib/mapset';
import { EXAMPLE } from '../../lib/mapsetCorpus';
import type { Layer } from '../../lib/mapsetFormat';
import type { Batch } from '../protocol';
import {
  airway,
  glyphs,
  labelWidth,
  oneWay,
  packed,
  sceneOf,
  type SceneOptions,
  segments,
  stopAt,
  textRuns,
} from './chartFixture';

/** The route labels of `chart`; `layers` are the layers shown. */
const routeLabels = (chart: Chart, options: SceneOptions = {}) =>
  sceneOf(chart, options).routeLabels();

/** The chevrons of a batch in their label's frame (turned back by `angle`): each tip and the x of its arms. */
function chevronsIn(batch: Batch, angle: number) {
  const frame = ({ x, y }: { x: number; y: number }) => ({
    x: x * Math.cos(angle) + y * Math.sin(angle),
    y: -x * Math.sin(angle) + y * Math.cos(angle),
  });
  const drawn = segments(batch);
  return Array.from({ length: drawn.length / 2 }, (_, i) => {
    const [arm, other] = [drawn[2 * i], drawn[2 * i + 1]];
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
  names.reduce((sum, n) => sum + labelWidth(n) + 10, 0) + 9 * (names.length - 1);

describe('the route labels', () => {
  const west = airway('conv', 'V901', [3, 1], [1, 0.5], [0, 0.25]);
  const example = chartOf([parseMapSet(EXAMPLE)]);

  it('centres a label on the middle of its span, along it and upright', () => {
    // Arrange
    const chart = [west];

    // Act
    const { text } = routeLabels(chart);

    // Assert
    const [label] = textRuns(text);
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
    const chart = [west];

    // Act
    const { gaps, text } = routeLabels(chart);

    // Assert
    const [gap] = segments(gaps);
    const angle = glyphs(text)[0]?.angle ?? NaN;
    const along = Math.atan2(
      (gap?.offsetB.y ?? 0) - (gap?.offsetA.y ?? 0),
      (gap?.offsetB.x ?? 0) - (gap?.offsetA.x ?? 0),
    );
    expect(gaps.count).toBe(1);
    expect(gap?.width).toBe(12);
    expect(gap?.color).toEqual(packed(PALETTE.bg));
    expect(
      Math.hypot(
        (gap?.offsetB.x ?? 0) - (gap?.offsetA.x ?? 0),
        (gap?.offsetB.y ?? 0) - (gap?.offsetA.y ?? 0),
      ),
    ).toBeCloseTo(labelWidth(4) + 8, 6);
    expect((gap?.offsetA.x ?? 0) + (gap?.offsetB.x ?? 0)).toBeCloseTo(0, 6);
    expect(along).toBeCloseTo(angle, 6);
    expect(gap?.a).toEqual(gap?.b);
  });

  it('labels a span shared by several routes once, each designator in its layer colour', () => {
    // Arrange
    const chart = example;

    // Act
    const { text } = routeLabels(chart);

    // Assert
    const runs = textRuns(text);
    const shared = runs.find((l) => l.text === 'V901Y902');
    expect(shared?.glyphs.map((g) => g.color)).toEqual([
      ...Array(4).fill(packed('#9a6a4c')),
      ...Array(4).fill(packed('#4a8090')),
    ]);
    expect(
      runs
        .filter((l) => l.text.includes('V901'))
        .map((l) => l.text)
        .toSorted(),
    ).toEqual(['A901V901Y902', 'V901Y902']);
  });

  it('keeps a conventional and an RNAV airway of one designator apart', () => {
    // Arrange
    const chart = [airway('conv', 'X1', [0, 0], [2, 0]), airway('rnav', 'X1', [0, 0], [2, 0])];

    // Act
    const { text } = routeLabels(chart);

    // Assert
    const [label] = textRuns(text);
    expect(label?.text).toBe('X1X1');
    expect(label?.glyphs.map((g) => g.color)).toEqual([
      ...Array(2).fill(packed('#9a6a4c')),
      ...Array(2).fill(packed('#4a8090')),
    ]);
  });

  it('labels a route once between its drawn stops, whatever fixes lie between', () => {
    // Arrange
    const chart = [
      airway('conv', 'V901', [0, 0], [1, 0], [2, 0]),
      stopAt('navaid', [0, 0], 'n0'),
      stopAt('fix', [1, 0], 'f1'),
      stopAt('navaid', [2, 0], 'n2'),
    ];
    const rows: Layer[][] = [
      ['conv', 'navaid'],
      ['conv', 'navaid', 'fix'],
    ];

    // Act
    const counts = rows.map((layers) => textRuns(routeLabels(chart, { layers }).text).length);

    // Assert
    expect(counts).toEqual([1, 2]);
  });

  it('gives a hidden route no label', () => {
    // Arrange
    const chart = [west];

    // Act
    const { text } = routeLabels(chart, { hidden: ['V901'] });

    // Assert
    expect(text.count).toBe(0);
  });

  it('shows a label from its threshold, hides it below, and keeps its state between', () => {
    // Arrange
    const chart = [stopAt('navaid', [0, 0]), airway('conv', 'V901', [0, 0], [2, 0])];
    const threshold = labelWidth(4) + 28;
    const cut = 12 / 2 + 3;
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
        routeLabels(chart, { scale: scaleOf(multiple), shown });
      }
      return shown;
    });

    // Act
    const drawn = rows.map(([multiples], i) => {
      const options = { scale: scaleOf(multiples.at(-1) ?? 0), shown: memories[i] ?? new Map() };
      return routeLabels(chart, options).text.count > 0;
    });

    // Assert
    expect(drawn).toEqual(rows.map(([, expected]) => expected));
  });

  describe('a procedure', () => {
    const sid = airway('sid', 'SID1', [0, 0], [0.5, 0], [2, 0], [4, 0]);
    const fixes = [stopAt('fix', [0.5, 0], 'f1'), stopAt('fix', [2, 0], 'f2')];
    const named = (scale: number) => textRuns(routeLabels([sid, ...fixes], { scale }).text);

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
      const chart = example;

      // Act
      const { text } = routeLabels(chart);

      // Assert
      const joined = textRuns(text).find((l) => l.text === 'TAVRO2.ZOLEKA901');
      expect(joined?.glyphs.map((g) => g.color)).toEqual([
        ...Array(12).fill(packed('#40707c')),
        ...Array(4).fill(packed('#9a6a4c')),
      ]);
    });

    it('does not take the room of an airway label that already fits', () => {
      // Arrange
      const chart = [airway('conv', 'V901', [0, 0], [2, 0]), airway('sid', 'SID1', [0, 0], [2, 0])];
      const scale = (2 * labelWidth(4) + 9 + 28 - 1) / 2;

      // Act
      const { text } = routeLabels(chart, { scale });

      // Assert
      expect(textRuns(text).map((l) => l.text)).toEqual(['V901']);
    });

    describe('on a span of airways', () => {
      const chart = [
        airway('conv', 'V901', [0, 0], [2, 0]),
        airway('conv', 'V902', [0, 0], [2, 0]),
        airway('sid', 'S1', [0, 0], [2, 0]),
      ];
      const airwayT = 2 * labelWidth(4) + 9 + 28;
      const textAt = (multiple: number, shown: ShownMemory) =>
        textRuns(routeLabels(chart, { scale: (multiple * airwayT) / 2, shown }).text).map(
          (l) => l.text,
        );

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
      const w = labelWidth(4);
      const rows: [Chart, { tipX: number; armX: number }][] = [
        [
          [oneWay('conv', 'V901', [0, 0], [2, 0])],
          { tipX: -(w + 10) / 2 + w + 9, armX: -(w + 10) / 2 + w + 4 },
        ],
        [
          [oneWay('conv', 'V901', [2, 0], [0, 0])],
          { tipX: -(w + 10) / 2 + 1, armX: -(w + 10) / 2 + 6 },
        ],
      ];

      // Act
      const found = rows.map(([chart]) => {
        const { text, chevrons } = routeLabels(chart);
        return chevronsIn(chevrons, glyphs(text)[0]?.angle ?? NaN);
      });

      // Assert
      found.forEach((chevs, i) => {
        const expected = rows[i]?.[1];
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
      const chart = [oneWay('conv', 'A1', [0, 0], [2, 0]), oneWay('rnav', 'B1', [2, 0], [0, 0])];
      const w = labelWidth(2);
      const start = -oneWayTotal(2, 2) / 2;

      // Act
      const { text, chevrons } = routeLabels(chart);

      // Assert
      const [first, second] = chevronsIn(chevrons, glyphs(text)[0]?.angle ?? NaN);
      expect(first?.tip.x).toBeCloseTo(start + w + 9, 6);
      expect(second?.tip.x).toBeCloseTo(start + w + 19 + 1, 6);
      expect(first?.color).toEqual(packed('#9a6a4c'));
      expect(second?.color).toEqual(packed('#4a8090'));
    });

    it('is flown along the reading on TAVRO-ZOLEK and against it on the way into QDG', () => {
      // Arrange
      const chart = example;

      // Act
      const { text, chevrons } = routeLabels(chart);

      // Assert
      const label = (name: string) => textRuns(text).find((l) => l.text === name);
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
      const threshold = labelWidth(4) + 28;
      const scale = (1.05 * threshold) / 2;
      const routes = [
        airway('conv', 'V901', [0, 0], [2, 0]),
        oneWay('conv', 'V901', [0, 0], [2, 0]),
      ];

      // Act
      const drawn = routes.map((route) => routeLabels([route], { scale }).text.count);

      // Assert
      expect(drawn.map((n) => n > 0)).toEqual([true, false]);
    });
  });
});
