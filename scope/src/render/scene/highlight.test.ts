import { describe, expect, it } from 'bun:test';

import { CHART_COLORS, PALETTE } from '../../design/palette';
import { type Chart, type ChartItem, chartOf, itemName } from '../../lib/chart';
import { parseMapSet } from '../../lib/mapset';
import { EXAMPLE } from '../../lib/mapsetCorpus';
import type { Batch } from '../protocol';
import {
  airway,
  partOf,
  line,
  keyed,
  itemOf,
  box,
  glyphs,
  labelWidth,
  markers,
  packed,
  point,
  polygon,
  sceneOf,
  segments,
  single,
  spelled,
  stopAt,
  withoutColor,
} from './chartFixture';

const stopped = [airway('conv', 'V901', [0, 0], [8, 0], [10, 0]), stopAt('navaid', [8, 0], 'N8')];
const shared = [airway('conv', 'V901', [0, 0], [2, 0]), airway('rnav', 'Y902', [0, 0], [2, 0])];

const grey = packed(PALETTE.hover);
const bright = packed(CHART_COLORS.pointHover);
const rnavLabel = packed('#4a8090');

/** How many glyphs of a text batch are in `color`. */
const inColor = (text: Batch, color: number[]) =>
  glyphs(text).filter((g) => g.color.join() === color.join()).length;

const itemKeyed = (chart: Chart, key: string): ChartItem => {
  const item = chart.find((i) => i.key === key);
  if (!item) throw new Error(`no item ${key}`);
  return item;
};

describe('the highlight of an area or a point', () => {
  const example = chartOf([parseMapSet(EXAMPLE)]);
  const papaqKey = example.find((i) => i.layer === 'tma' && itemName(i) === 'PAPAQ')?.key ?? '';
  const fix = [single('fix', point([3, 3]), {}, 'F1')];

  it("is the chart's own label for an item that is hidden, as the chart would draw it", () => {
    // Arrange
    const shownArea = sceneOf(example, { layers: ['tma'] }).areaLabels();
    const shownPoint = sceneOf(fix).pointLabels();
    const areaScene = sceneOf(example, { layers: ['tma'], hidden: [papaqKey] });
    const pointScene = sceneOf(fix, { hidden: ['F1'] });

    // Act
    const lit = [
      areaScene.highlight(itemKeyed(example, papaqKey)).text,
      pointScene.highlight(itemKeyed(fix, 'F1')).points.idents,
    ];

    // Assert
    expect(lit.map((text) => withoutColor(glyphs(text)))).toEqual([
      withoutColor(glyphs(shownArea.text)),
      withoutColor(glyphs(shownPoint.text)),
    ]);
    expect(lit.map((text) => text.count > 0)).toEqual([true, true]);
  });

  it('redraws the text and the rule of a drawn area as the chart drew them, in the hover grey', () => {
    // Arrange
    const scene = sceneOf(example, { layers: ['tma'] });
    const { text, rules } = scene.areaLabels();

    // Act
    const lit = scene.highlight(itemKeyed(example, papaqKey));

    // Assert
    expect(rules.count).toBe(1);
    expect(withoutColor(glyphs(lit.text))).toEqual(withoutColor(glyphs(text)));
    expect(withoutColor(segments(lit.strokes))).toEqual(withoutColor(segments(rules)));
    expect(glyphs(lit.text).map((g) => g.color)).toEqual(glyphs(lit.text).map(() => grey));
    expect(segments(lit.strokes).map((s) => s.color)).toEqual(
      segments(lit.strokes).map(() => grey),
    );
  });

  it('redraws the ident of a drawn point as the chart drew it, brighter than the hover grey', () => {
    // Arrange
    const scene = sceneOf(fix);
    const { text } = scene.pointLabels();

    // Act
    const { idents } = scene.highlight(itemKeyed(fix, 'F1')).points;

    // Assert
    expect(idents.count).toBeGreaterThan(0);
    expect(withoutColor(glyphs(idents))).toEqual(withoutColor(glyphs(text)));
    expect(glyphs(idents).map((g) => g.color)).toEqual(glyphs(idents).map(() => bright));
  });

  it('names a sector below the density that labels sectors, at its place', () => {
    // Arrange
    const sector = single('sector', polygon(box(0, 4)), { name: 'SEC' }, 'SEC');
    const scene = sceneOf([sector], { hidden: ['SEC'], density: 'sparse' });

    // Act
    const lit = scene.highlight(sector);

    // Assert
    expect(spelled(lit.text)).toBe('SEC');
    expect(glyphs(lit.text)[0]?.at).toMatchObject({ x: 2, y: 2 });
  });

  it("says what DENSE says, on the chart's name, for a sector the chart named at NORMAL", () => {
    // Arrange
    const sector = single('sector', polygon(box(0, 4)), { name: 'SEC', freqs: ['118.50'] }, 'SEC');
    const scene = sceneOf([sector], { density: 'normal' });
    const chartName = glyphs(scene.areaLabels().text);

    // Act
    const lit = scene.highlight(sector);

    // Assert
    expect(chartName.map((g) => g.char).join('')).toBe('SEC');
    expect(spelled(lit.text)).toBe('SEC118.50');
    expect(glyphs(lit.text)[0]?.at).toEqual(chartName[0]?.at ?? { x: NaN, y: NaN });
  });

  it('says what DENSE says, centred on its place, for an area the chart does not name', () => {
    // Arrange
    const area = single(
      'ctr',
      polygon(box(0, 4)),
      { name: 'CTR', lower: 'SFC', upper: '3000FT' },
      'CTR',
    );
    const scene = sceneOf([area], { density: 'normal' });

    // Act
    const lit = scene.highlight(area);

    // Assert
    expect(spelled(lit.text)).toBe('CTR030SFC');
    expect(lit.strokes.count).toBe(1);
    expect(glyphs(lit.text)[0]?.at).toMatchObject({ x: 2, y: 2 });
  });
});

describe('the highlight of a route', () => {
  it('lays out a hidden airway as the chart does when it is shown', () => {
    // Arrange
    const item = itemKeyed(stopped, 'V901');
    const shown = sceneOf(stopped).routeLabels();
    const scene = sceneOf(stopped, { hidden: ['V901'] });

    // Act
    const lit = scene.highlight(item);

    // Assert
    expect(glyphs(lit.text)).toHaveLength(8);
    expect(withoutColor(glyphs(lit.text))).toEqual(withoutColor(glyphs(shown.text)));
    expect(withoutColor(segments(lit.gaps))).toEqual(withoutColor(segments(shown.gaps)));
    expect(inColor(lit.text, grey)).toBe(8);
  });

  it('redraws the labels of a drawn airway whole, with it lit', () => {
    // Arrange
    const item = itemKeyed(stopped, 'V901');
    const scene = sceneOf(stopped);
    const shown = scene.routeLabels();

    // Act
    const lit = scene.highlight(item);

    // Assert
    expect(withoutColor(glyphs(lit.text))).toEqual(withoutColor(glyphs(shown.text)));
    expect(withoutColor(segments(lit.gaps))).toEqual(withoutColor(segments(shown.gaps)));
    expect(inColor(lit.text, grey)).toBe(8);
  });

  it('adds the designator on a span the chart left out, to those it drew', () => {
    // Arrange
    const scale = (labelWidth(4) + 28) / 4;
    const scene = sceneOf(stopped, { scale });
    const chartRuns = spelled(scene.routeLabels().text);

    // Act
    const lit = scene.highlight(itemKeyed(stopped, 'V901'));

    // Assert
    expect(chartRuns).toBe('V901');
    expect(glyphs(lit.text)).toHaveLength(8);
    expect(new Set(glyphs(lit.text).map((g) => g.at.x))).toEqual(new Set([4, 9]));
  });

  it('names a procedure the chart did not draw once, on its first span', () => {
    // Arrange
    const chart = [airway('sid', 'SID1', [0, 0], [8, 0], [10, 0]), stopAt('navaid', [8, 0], 'N8')];
    const scene = sceneOf(chart, { hidden: ['SID1'] });

    // Act
    const lit = scene.highlight(itemKeyed(chart, 'SID1'));

    // Assert
    expect(glyphs(lit.text)).toHaveLength(4);
    expect(new Set(glyphs(lit.text).map((g) => g.at.x))).toEqual(new Set([4]));
  });

  it('lights a procedure on the span the chart named it on, not on its first span', () => {
    // Arrange
    const chart = [airway('sid', 'SID1', [0, 0], [2, 0], [10, 0]), stopAt('navaid', [2, 0], 'N2')];
    const scene = sceneOf(chart, { scale: (labelWidth(4) + 28) / 4 });
    // Precondition: the chart names it once, on its second span only
    const named = glyphs(scene.routeLabels().text).map((g) => g.at.x);

    // Act
    const lit = scene.highlight(itemKeyed(chart, 'SID1'));

    // Assert
    expect(named).toEqual([6, 6, 6, 6]);
    expect(glyphs(lit.text).map((g) => g.at.x)).toEqual([6, 6, 6, 6]);
  });

  it('lights a hidden designator inside the label its span has, the others in their colours', () => {
    // Arrange
    const item = itemKeyed(shared, 'V901');
    const shown = sceneOf(shared).routeLabels();
    const scene = sceneOf(shared, { hidden: ['V901'] });

    // Act
    const lit = scene.highlight(item);

    // Assert
    expect(withoutColor(glyphs(lit.text))).toEqual(withoutColor(glyphs(shown.text)));
    expect(withoutColor(segments(lit.gaps))).toEqual(withoutColor(segments(shown.gaps)));
    expect(lit.gaps.count).toBe(1);
    expect([inColor(lit.text, grey), inColor(lit.text, rnavLabel)]).toEqual([4, 4]);
  });

  it('lights a drawn designator inside its span label as well, on one gap', () => {
    // Arrange
    const scene = sceneOf(shared);
    const shown = scene.routeLabels();

    // Act
    const lit = scene.highlight(itemKeyed(shared, 'V901'));

    // Assert
    expect(withoutColor(glyphs(lit.text))).toEqual(withoutColor(glyphs(shown.text)));
    expect(withoutColor(segments(lit.gaps))).toEqual(withoutColor(segments(shown.gaps)));
    expect([inColor(lit.text, grey), inColor(lit.text, rnavLabel)]).toEqual([4, 4]);
  });

  it('centres a designator alone, in a gap of its own, where the chart has no label', () => {
    // Arrange
    const scene = sceneOf(shared, { hidden: ['V901'], scale: 1 });
    const chartLabels = scene.routeLabels().text.count;

    // Act
    const lit = scene.highlight(itemKeyed(shared, 'V901'));

    // Assert
    const [gap] = segments(lit.gaps);
    expect(chartLabels).toBe(0);
    expect(glyphs(lit.text)).toHaveLength(4);
    expect(lit.gaps.count).toBe(1);
    expect(gap?.offsetA.x).toBeCloseTo(-labelWidth(4) / 2 - 4, 6);
    expect(gap?.offsetB.x).toBeCloseTo(labelWidth(4) / 2 + 4, 6);
  });

  it("leaves no trace in the chart's labels of an item pointed at before", () => {
    // Arrange
    const chart = [airway('conv', 'V901', [0, 0], [1, 0]), airway('rnav', 'Y902', [0, 0], [1, 0])];
    const scene = sceneOf(chart, { hidden: ['Y902'] });
    scene.highlight(itemKeyed(chart, 'Y902'));

    // Act
    const lit = scene.highlight(itemKeyed(chart, 'V901'));

    // Assert
    expect(spelled(lit.text)).toBe('V901');
  });

  it('lights the chevron of a one-way designator with its name', () => {
    // Arrange
    const oneWay = keyed(
      'C1',
      itemOf('conv', partOf('conv', line([0, 0], [1, 0]), { name: 'C1', oneWay: true })),
    );
    const scene = sceneOf([oneWay]);

    // Act
    const lit = scene.highlight(oneWay);

    // Assert
    const arms = segments(lit.strokes);
    expect(arms).toHaveLength(2);
    expect(arms.map((arm) => arm.color)).toEqual([grey, grey]);
  });

  describe('the points it passes', () => {
    const route = airway('conv', 'V901', [0, 0], [1, 0], [2, 0]);
    const fix = single('fix', point([1, 0]), { id: 'F1' }, 'F1');
    const navaid = single('navaid', point([2, 0]), { id: 'N2' }, 'N2');
    const chart = [route, fix, navaid];

    it('lights each one, symbol and ident, as the chart draws it and brighter', () => {
      // Arrange
      const scene = sceneOf(chart);
      const chartMarkers = markers(sceneOf([fix, navaid]).shapes().markers);
      const chartStrokes = segments(sceneOf([fix, navaid]).shapes().lines);
      const chartIdents = scene.pointLabels().text;

      // Act
      const { points } = scene.highlight(route);

      // Assert
      expect(withoutColor(markers(points.markers))).toEqual(withoutColor(chartMarkers));
      expect(withoutColor(segments(points.strokes))).toEqual(withoutColor(chartStrokes));
      expect(withoutColor(glyphs(points.idents))).toEqual(withoutColor(glyphs(chartIdents)));
      const colors = [
        ...markers(points.markers),
        ...segments(points.strokes),
        ...glyphs(points.idents),
      ].map((row) => row.color);
      expect(colors).toEqual(colors.map(() => bright));
    });

    it('lights one the chart hides, at a density that names none', () => {
      // Arrange
      const scene = sceneOf(chart, { hidden: ['F1', 'N2'], density: 'off' });

      // Act
      const { points } = scene.highlight(route);

      // Assert
      expect(spelled(points.idents)).toBe('F1N2');
      expect(markers(points.markers).map((m) => m.at.x)).toEqual([1, 2]);
    });

    it('lights a point once however many parts of the route pass it', () => {
      // Arrange
      const parts = keyed(
        'R',
        itemOf(
          'conv',
          partOf('conv', line([0, 0], [1, 0]), { name: 'R' }),
          partOf('conv', line([1, 0], [2, 0]), { name: 'R' }),
        ),
      );
      const scene = sceneOf([parts, fix]);

      // Act
      const { points } = scene.highlight(parts);

      // Assert
      expect(spelled(points.idents)).toBe('F1');
    });

    it('leaves a point off the route dark, however near', () => {
      // Arrange
      const beside = single('fix', point([1, 0.5]), { id: 'F2' }, 'F2');
      const scene = sceneOf([route, beside]);

      // Act
      const { points } = scene.highlight(route);

      // Assert
      expect([points.markers.count, points.idents.count]).toEqual([0, 0]);
    });

    it('lights no point on an area that has one at a corner', () => {
      // Arrange
      const sector = single('sector', polygon(box(0, 4)), { name: 'SEC' }, 'SEC');
      const corner = single('fix', point([0, 0]), { id: 'F3' }, 'F3');
      const scene = sceneOf([sector, corner]);

      // Act
      const { points } = scene.highlight(sector);

      // Assert
      expect([points.markers.count, points.idents.count]).toEqual([0, 0]);
    });
  });

  it('draws nothing for an item whose layer has no label', () => {
    // Arrange
    const chart = [airway('dct', 'D1', [0, 0], [2, 0])];
    const scene = sceneOf(chart, { hidden: ['D1'] });

    // Act
    const lit = scene.highlight(itemKeyed(chart, 'D1'));

    // Assert
    expect([lit.gaps.count, lit.text.count, lit.strokes.count]).toEqual([0, 0, 0]);
  });
});
