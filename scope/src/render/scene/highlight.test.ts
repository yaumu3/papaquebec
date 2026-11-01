import { describe, expect, it } from 'bun:test';

import { type Chart, type ChartItem, chartOf, itemName } from '../../lib/chart';
import { DRAW_STACK, drawnItemsOf, isStyled, type StyledLayer } from '../../lib/layers';
import { parseMapSet } from '../../lib/mapset';
import { EXAMPLE } from '../../lib/mapsetCorpus';
import { areaPlaceOf } from '../../lib/pole';
import { drawnPointsOf, topologyOf } from '../../lib/topology';
import { shownExcept } from '../../lib/visibilityFixture';
import type { LabelDensity } from '../../state/settingsDefaults';
import type { Batch } from '../protocol';
import { CHART_SLICES } from '../slots';
import { atlas } from './atlasFixture';
import { buildSliceLabels } from './chart';
import {
  airway,
  glyphs,
  instances,
  itemOf,
  keyed,
  packed,
  partOf,
  point,
  polygon,
  project,
  withoutColor,
} from './chartFixture';
import type { BuiltLabels, DrawnLabel } from './drawnLabels';
import { buildHighlight, highlightOf } from './highlight';
import { LAYER_STYLES } from './layerStyles';
import { LineBatch, TextBatch } from './pack';
import { THEME } from './rules';

const ALL_LAYERS = DRAW_STACK.filter(isStyled);
const ROOMY = 1e6;

/** CSS px a run of `n` characters takes at 9 px in the fixture's atlas. */
const widthOf = (n: number) => (n * atlas.advance * 9) / atlas.fontSize;

const navaid = (x: number) => keyed(`N${x}`, itemOf('navaid', partOf('navaid', point([x, 0]))));

/** What the scene reads for `chart` with the items `hidden` not drawn. */
function drawnOf(chart: Chart, hidden: readonly string[]) {
  const topology = topologyOf(chart);
  const drawnItems = drawnItemsOf(
    chart,
    ALL_LAYERS,
    () => shownExcept(...hidden),
    () => true,
  );
  return { topology, drawnItems, drawnPoints: () => drawnPointsOf(topology, drawnItems) };
}

/** The labels the chart draws for the slice of `layer`, `hidden` items not drawn. */
function chartLabels(
  chart: Chart,
  layer: StyledLayer,
  hidden: readonly string[] = [],
  settledScale = ROOMY,
  labelDensity: LabelDensity = 'dense',
): BuiltLabels {
  const slice = CHART_SLICES.find(({ layers }) => layers.some((l) => l === layer));
  if (!slice) throw new Error(`no slice holds ${layer}`);
  const { topology, drawnItems, drawnPoints } = drawnOf(chart, hidden);
  return buildSliceLabels(slice, {
    topology,
    drawnPoints,
    project,
    layers: slice.layers,
    drawnItems: drawnItems.filter((i) => slice.layers.some((l) => l === i.layer)),
    labelDensity,
    atlas,
    settledScale: () => settledScale,
    shown: new Map(),
    placeOf: (i) => areaPlaceOf(i, project),
  });
}

/** What the highlight reads: the chart with `hidden` items not drawn, and its route labels. */
function inputOf(
  chart: Chart,
  hidden: readonly string[] = [],
  labelDensity: LabelDensity = 'dense',
  routes?: BuiltLabels,
) {
  const { topology, drawnPoints } = drawnOf(chart, hidden);
  return {
    topology,
    drawnPoints,
    project,
    labelDensity,
    atlas,
    placeOf: (item: ChartItem) => areaPlaceOf(item, project),
    spanLabels: routes?.spanLabels ?? new Map(),
  };
}

const itemKeyed = (chart: Chart, key: string): ChartItem => {
  const item = chart.find((i) => i.key === key);
  if (!item) throw new Error(`no item ${key}`);
  return item;
};

/** The gaps and the text a route build drew. */
function routeBatches({ batches: [gaps, text] }: BuiltLabels): [Batch, Batch] {
  if (!gaps || !text) throw new Error('the route labels drew too few batches');
  return [gaps, text];
}

const stopped = [airway('conv', 'V901', [0, 0], [8, 0], [10, 0]), navaid(8)];
const shared = [airway('conv', 'V901', [0, 0], [2, 0]), airway('rnav', 'Y902', [0, 0], [2, 0])];

const grey = packed(THEME.hover);
const rnavColor = packed(LAYER_STYLES.rnav.label?.color ?? '');

/** How many glyphs of a text batch are in `color`. */
const inColor = (text: Parameters<typeof glyphs>[0], color: number[]) =>
  glyphs(text).filter((g) => g.color.join() === color.join()).length;

const square: [number, number][] = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
  [0, 0],
];

describe('highlightOf', () => {
  it("is the chart's own label for an item that is hidden, as the chart would draw it", () => {
    // Arrange
    const example = chartOf([parseMapSet(EXAMPLE)]);
    const tma = example.find((i) => i.layer === 'tma' && itemName(i) === 'PAPAQ')?.key ?? '';
    const fix = [keyed('F1', itemOf('fix', partOf('fix', point([3, 3]))))];
    const cases: [Chart, StyledLayer, string][] = [
      [example, 'tma', tma],
      [fix, 'fix', 'F1'],
    ];
    const rows = cases.map(([chart, layer, key]) => ({
      item: itemKeyed(chart, key),
      input: inputOf(chart, [key]),
      drawn: chartLabels(chart, layer).drawn?.get(key),
    }));

    // Act
    const highlights = rows.map(({ item, input }) => highlightOf(item, undefined, input));

    // Assert
    expect(rows.every(({ drawn }) => drawn !== undefined)).toBe(true);
    expect(highlights).toEqual(rows.map(({ drawn }) => drawn));
  });

  it('names a sector below the density that labels sectors, at its place', () => {
    // Arrange
    const sector = keyed(
      'SEC',
      itemOf('sector', partOf('sector', polygon(square), { name: 'SEC' })),
    );
    const input = inputOf([sector], ['SEC'], 'sparse');
    const place = areaPlaceOf(sector, project);

    // Act
    const highlight = highlightOf(sector, undefined, input);

    // Assert
    expect(highlight?.texts.map((t) => t.text)).toEqual(['SEC']);
    expect(highlight?.texts[0]?.at).toMatchObject({ x: place?.at.x, y: place?.at.y });
  });

  it("says what DENSE says, on the chart's name, for a sector the chart named at NORMAL", () => {
    // Arrange
    const sector = keyed(
      'SEC',
      itemOf('sector', partOf('sector', polygon(square), { name: 'SEC', freqs: ['118.50'] })),
    );
    const drawn = chartLabels([sector], 'sector', [], ROOMY, 'normal').drawn?.get('SEC');
    const input = inputOf([sector], [], 'normal');

    // Act
    const highlight = highlightOf(sector, drawn, input);

    // Assert
    expect(drawn?.texts.map((t) => t.text)).toEqual(['SEC']);
    expect(highlight?.texts.map((t) => t.text)).toEqual(['SEC', '118.50']);
    expect([highlight?.texts[0]?.at]).toEqual([drawn?.texts[0]?.at]);
  });

  it('says what DENSE says, centred on its place, for an area the chart does not name', () => {
    // Arrange
    const area = keyed(
      'CTR',
      itemOf('ctr', partOf('ctr', polygon(square), { name: 'CTR', lower: 'SFC', upper: '3000FT' })),
    );
    const input = inputOf([area], [], 'normal');
    const place = areaPlaceOf(area, project);

    // Act
    const highlight = highlightOf(area, undefined, input);

    // Assert
    expect(highlight?.texts.map((t) => t.text)).toEqual(['CTR', '030', 'SFC']);
    expect(highlight?.strokes).toHaveLength(1);
    expect(highlight?.texts[0]?.at).toMatchObject({ x: place?.at.x, y: place?.at.y });
  });
});

describe('buildHighlight of a route', () => {
  it('lays out a hidden airway as the chart does when it is shown', () => {
    // Arrange
    const item = itemKeyed(stopped, 'V901');
    const shown = routeBatches(chartLabels(stopped, 'conv'));
    const input = inputOf(stopped, ['V901'], 'dense', chartLabels(stopped, 'conv', ['V901']));

    // Act
    const [gaps, text] = buildHighlight(item, undefined, input);

    // Assert
    const [shownGaps, shownText] = shown;
    expect(glyphs(text)).toHaveLength(8);
    expect(withoutColor(glyphs(text))).toEqual(withoutColor(glyphs(shownText)));
    expect(withoutColor(instances(gaps))).toEqual(withoutColor(instances(shownGaps)));
    expect(inColor(text, grey)).toBe(8);
  });

  it('redraws the labels of a drawn airway whole, with it lit', () => {
    // Arrange
    const item = itemKeyed(stopped, 'V901');
    const shown = chartLabels(stopped, 'conv');
    const input = inputOf(stopped, [], 'dense', shown);

    // Act
    const [gaps, text] = buildHighlight(item, undefined, input);

    // Assert
    const [shownGaps, shownText] = routeBatches(shown);
    expect(withoutColor(glyphs(text))).toEqual(withoutColor(glyphs(shownText)));
    expect(withoutColor(instances(gaps))).toEqual(withoutColor(instances(shownGaps)));
    expect(inColor(text, grey)).toBe(8);
  });

  it('adds the designator on a span the chart left out, to those it drew', () => {
    // Arrange
    const roomy = (widthOf(4) + 28) / 4;
    const item = itemKeyed(stopped, 'V901');
    const shown = chartLabels(stopped, 'conv', [], roomy);
    const input = inputOf(stopped, [], 'dense', shown);

    // Act
    const [, text] = buildHighlight(item, undefined, input);

    // Assert
    expect(shown.spanLabels?.size).toBe(1);
    expect(glyphs(text)).toHaveLength(8);
    expect(new Set(glyphs(text).map((g) => g.at.x))).toEqual(new Set([4, 9]));
  });

  it('names a procedure the chart did not draw once, on its first span', () => {
    // Arrange
    const chart = [airway('sid', 'SID1', [0, 0], [8, 0], [10, 0]), navaid(8)];
    const input = inputOf(chart, ['SID1'], 'dense', chartLabels(chart, 'sid', ['SID1']));

    // Act
    const [, text] = buildHighlight(itemKeyed(chart, 'SID1'), undefined, input);

    // Assert
    expect(glyphs(text)).toHaveLength(4);
    expect(new Set(glyphs(text).map((g) => g.at.x))).toEqual(new Set([4]));
  });

  it('lights a procedure on the span the chart named it on, not on its first span', () => {
    // Arrange
    const chart = [airway('sid', 'SID1', [0, 0], [2, 0], [10, 0]), navaid(2)];
    const roomy = (widthOf(4) + 28) / 4;
    const shown = chartLabels(chart, 'sid', [], roomy);
    const input = inputOf(chart, [], 'dense', shown);
    const item = itemKeyed(chart, 'SID1');
    // Precondition: the chart names it once, on its second span only
    const named = glyphs(routeBatches(shown)[1]).map((g) => g.at.x);

    // Act
    const [, text] = buildHighlight(item, undefined, input);

    // Assert
    expect(named).toEqual([6, 6, 6, 6]);
    expect(glyphs(text).map((g) => g.at.x)).toEqual([6, 6, 6, 6]);
  });

  it('lights a hidden designator inside the label its span has, the others in their colours', () => {
    // Arrange
    const item = itemKeyed(shared, 'V901');
    const shown = routeBatches(chartLabels(shared, 'conv'));
    const input = inputOf(shared, ['V901'], 'dense', chartLabels(shared, 'conv', ['V901']));

    // Act
    const [gaps, text] = buildHighlight(item, undefined, input);

    // Assert
    const [shownGaps, shownText] = shown;
    expect(withoutColor(glyphs(text))).toEqual(withoutColor(glyphs(shownText)));
    expect(withoutColor(instances(gaps))).toEqual(withoutColor(instances(shownGaps)));
    expect(instances(gaps)).toHaveLength(1);
    expect([inColor(text, grey), inColor(text, rnavColor)]).toEqual([4, 4]);
  });

  it('lights a drawn designator inside its span label as well, on one gap', () => {
    // Arrange
    const item = itemKeyed(shared, 'V901');
    const shown = chartLabels(shared, 'conv');
    const input = inputOf(shared, [], 'dense', shown);

    // Act
    const [gaps, text] = buildHighlight(item, undefined, input);

    // Assert
    const [shownGaps, shownText] = routeBatches(shown);
    expect(withoutColor(glyphs(text))).toEqual(withoutColor(glyphs(shownText)));
    expect(withoutColor(instances(gaps))).toEqual(withoutColor(instances(shownGaps)));
    expect([inColor(text, grey), inColor(text, rnavColor)]).toEqual([4, 4]);
  });

  it('centres a designator alone, in a gap of its own, where the chart has no label', () => {
    // Arrange
    const dropped = chartLabels(shared, 'conv', ['V901'], 1);
    const input = inputOf(shared, ['V901'], 'dense', dropped);

    // Act
    const [gaps, text] = buildHighlight(itemKeyed(shared, 'V901'), undefined, input);

    // Assert
    const [gap] = instances(gaps);
    expect(dropped.spanLabels?.size).toBe(0);
    expect(glyphs(text)).toHaveLength(4);
    expect(instances(gaps)).toHaveLength(1);
    expect(gap?.offsetA.x).toBeCloseTo(-widthOf(4) / 2 - 4, 6);
    expect(gap?.offsetB.x).toBeCloseTo(widthOf(4) / 2 + 4, 6);
  });

  it('draws nothing for an item whose layer has no label', () => {
    // Arrange
    const chart = [airway('dct', 'D1', [0, 0], [2, 0])];
    const input = inputOf(chart, ['D1']);

    // Act
    const batches = buildHighlight(itemKeyed(chart, 'D1'), undefined, input);

    // Assert
    expect(batches.map((b) => b.count)).toEqual([0, 0, 0]);
  });
});

describe('buildHighlight', () => {
  const label: DrawnLabel = {
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

  const fix = keyed('F1', itemOf('fix', partOf('fix', point([1, 2]))));
  const input = inputOf([fix]);

  it('draws its text again in the hover grey, as the chart drew it', () => {
    // Arrange
    const [run] = label.texts;
    const expected = new TextBatch(atlas);
    if (run) expected.text(run.text, run.at, run.size, run.color, run.style);

    // Act
    const [, text] = buildHighlight(fix, label, input);

    // Assert
    const drawn = glyphs(text);
    expect(drawn.length).toBeGreaterThan(0);
    expect(withoutColor(drawn)).toEqual(withoutColor(glyphs(expected.finish())));
    expect(drawn.map((g) => g.color)).toEqual(drawn.map(() => grey));
  });

  it('draws its segments again in the hover grey', () => {
    // Arrange
    const [arm] = label.strokes;
    const wantedArm = new LineBatch();
    if (arm) wantedArm.segment(arm.from, arm.to, THEME.hover, { width: arm.width });

    // Act
    const [, , strokes] = buildHighlight(fix, label, input);

    // Assert
    expect(instances(strokes)).toEqual(instances(wantedArm.finish()));
  });
});
