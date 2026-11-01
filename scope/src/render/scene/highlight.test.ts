import { describe, expect, it } from 'bun:test';

import { type Chart, type ChartItem, chartOf, itemName } from '../../lib/chart';
import { DRAW_STACK, drawnItemsOf, isStyled } from '../../lib/layers';
import { parseMapSet } from '../../lib/mapset';
import { EXAMPLE } from '../../lib/mapsetCorpus';
import { areaPlaceOf } from '../../lib/pole';
import { drawnPointsOf, topologyOf } from '../../lib/topology';
import { allShown, shownExcept } from '../../lib/visibilityFixture';
import type { LabelDensity } from '../../state/settingsDefaults';
import { CHART_SLICES } from '../slots';
import { atlas } from './atlasFixture';
import { buildSliceLabels } from './chart';
import { airway, itemOf, keyed, partOf, point, polygon, project } from './chartFixture';
import type { DrawnLabel } from './drawnLabels';
import { highlightOf } from './highlight';

const ALL_LAYERS = DRAW_STACK.filter(isStyled);

/** CSS px a run of `n` characters takes at 9 px in the fixture's atlas. */
const widthOf = (n: number) => (n * atlas.advance * 9) / atlas.fontSize;

const navaid = (x: number) => keyed(`N${x}`, itemOf('navaid', partOf('navaid', point([x, 0]))));

/** What the highlight of `key` reads when every item but that one is drawn. */
function inputWithout(chart: Chart, key?: string, labelDensity: LabelDensity = 'dense') {
  const topology = topologyOf(chart);
  const drawnItems = drawnItemsOf(
    chart,
    ALL_LAYERS,
    () => shownExcept(...(key ? [key] : [])),
    () => true,
  );
  const drawnPoints = () => drawnPointsOf(topology, drawnItems);
  return {
    topology,
    drawnPoints,
    project,
    labelDensity,
    atlas,
    placeOf: (item: ChartItem) => areaPlaceOf(item, project),
  };
}

/** The label the chart draws for `key` with everything shown, at a scale where labels have room. */
function chartRecord(
  chart: Chart,
  key: string,
  settledScale = 1e6,
  labelDensity: LabelDensity = 'dense',
) {
  const topology = topologyOf(chart);
  const drawnItems = drawnItemsOf(chart, ALL_LAYERS, allShown, () => true);
  const item = chart.find((i) => i.key === key);
  const slice = CHART_SLICES.find(({ layers }) => layers.some((l) => l === item?.layer));
  if (!slice) throw new Error(`no slice holds ${key}`);
  const { drawn } = buildSliceLabels(slice, {
    topology,
    drawnPoints: () => drawnPointsOf(topology, drawnItems),
    project,
    layers: slice.layers,
    drawnItems: drawnItems.filter((i) => slice.layers.some((l) => l === i.layer)),
    labelDensity,
    atlas,
    settledScale: () => settledScale,
    shown: new Map(),
    placeOf: (i) => areaPlaceOf(i, project),
  });
  return drawn.get(key);
}

const itemKeyed = (chart: Chart, key: string): ChartItem => {
  const item = chart.find((i) => i.key === key);
  if (!item) throw new Error(`no item ${key}`);
  return item;
};

/** A label with its parts in one order: the chart draws a route's spans back to front. */
const inOrder = (label: DrawnLabel | undefined) =>
  label && {
    gaps: label.gaps.map((g) => JSON.stringify(g)).toSorted(),
    spans: label.spans.toSorted(),
    texts: label.texts.map((t) => JSON.stringify(t)).toSorted(),
    strokes: label.strokes.map((t) => JSON.stringify(t)).toSorted(),
  };

const stopped = [airway('conv', 'V901', [0, 0], [8, 0], [10, 0]), navaid(8)];

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
    const cases: [Chart, string][] = [
      [example, tma],
      [stopped, 'V901'],
      [fix, 'F1'],
    ];
    const rows = cases.map(([chart, key]) => ({ chart, key, input: inputWithout(chart, key) }));
    const drawn = cases.map(([chart, key]) => chartRecord(chart, key));

    // Act
    const highlights = rows.map(({ chart, key, input }) =>
      highlightOf(itemKeyed(chart, key), undefined, input),
    );

    // Assert
    expect(drawn.every((record) => record !== undefined)).toBe(true);
    expect(highlights.map(inOrder)).toEqual(drawn.map(inOrder));
  });

  it('names a sector below the density that labels sectors, at its place', () => {
    // Arrange
    const sector = keyed(
      'SEC',
      itemOf('sector', partOf('sector', polygon(square), { name: 'SEC' })),
    );
    const input = inputWithout([sector], 'SEC', 'sparse');
    const place = areaPlaceOf(sector, project);

    // Act
    const highlight = highlightOf(sector, undefined, input);

    // Assert
    expect(highlight?.texts.map((t) => t.text)).toEqual(['SEC']);
    expect(highlight?.texts[0]?.at).toMatchObject({ x: place?.at.x, y: place?.at.y });
  });

  it('adds nothing to an airway the chart labels on every span', () => {
    // Arrange
    const record = chartRecord(stopped, 'V901');
    const input = inputWithout(stopped);

    // Act
    const highlight = highlightOf(itemKeyed(stopped, 'V901'), record, input);

    // Assert
    expect(record?.texts).toHaveLength(2);
    expect(highlight).toEqual(record);
  });

  it('adds the designator on a span the chart left out, to those it drew', () => {
    // Arrange
    const roomy = (widthOf(4) + 28) / 4;
    const record = chartRecord(stopped, 'V901', roomy);
    const input = inputWithout(stopped);

    // Act
    const highlight = highlightOf(itemKeyed(stopped, 'V901'), record, input);

    // Assert
    expect(record?.texts.map((t) => t.at.x)).toEqual([4]);
    expect(highlight?.texts.map((t) => t.at.x)).toEqual([4, 9]);
  });

  it('names a procedure the chart did not draw once, on its first span', () => {
    // Arrange
    const chart = [airway('sid', 'SID1', [0, 0], [8, 0], [10, 0]), navaid(8)];
    const input = inputWithout(chart, 'SID1');

    // Act
    const highlight = highlightOf(itemKeyed(chart, 'SID1'), undefined, input);

    // Assert
    expect(highlight?.texts.map((t) => [t.text, t.at.x])).toEqual([['SID1', 4]]);
  });

  it('centres a designator on a span whose shared label the chart dropped, in a gap of its own', () => {
    // Arrange
    const chart = [airway('conv', 'V901', [0, 0], [2, 0]), airway('rnav', 'Y902', [0, 0], [2, 0])];
    const input = inputWithout(chart, 'V901');
    const dropped = chartRecord(chart, 'V901', 1);

    // Act
    const highlight = highlightOf(itemKeyed(chart, 'V901'), undefined, input);

    // Assert
    expect(dropped).toBeUndefined();
    expect(highlight?.texts.map((t) => t.text)).toEqual(['V901']);
    expect(highlight?.texts[0]?.at.px).toBeCloseTo(-widthOf(4) / 2, 6);
    expect(highlight?.gaps).toHaveLength(1);
  });

  it('draws nothing for an item whose layer has no label', () => {
    // Arrange
    const chart = [airway('dct', 'D1', [0, 0], [2, 0])];
    const input = inputWithout(chart, 'D1');

    // Act
    const highlight = highlightOf(itemKeyed(chart, 'D1'), undefined, input);

    // Assert
    expect(highlight).toBeUndefined();
  });
});
