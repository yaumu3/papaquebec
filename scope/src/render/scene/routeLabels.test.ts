import { describe, expect, it } from 'bun:test';

import { type Chart, chartOf } from '../../lib/chart';
import { DRAW_STACK, drawnItemsOf, isStyled, type StyledLayer } from '../../lib/layers';
import { parseMapSet } from '../../lib/mapset';
import { EXAMPLE } from '../../lib/mapsetCorpus';
import type { Layer } from '../../lib/mapsetFormat';
import { drawnPointsOf, topologyOf } from '../../lib/topology';
import type { LayerState } from '../../lib/visibility';
import { allShown, shownExcept } from '../../lib/visibilityFixture';
import { LABEL_DENSITIES, type LabelDensity } from '../../state/settingsDefaults';
import { atlas } from './atlasFixture';
import {
  glyphs,
  instances,
  itemOf,
  keyed,
  line,
  packed,
  partOf,
  point,
  project,
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
) {
  const topology = topologyOf(items);
  const drawnItems = drawnItemsOf(items, layers, stateOf, () => true);
  const drawnPoints = () => drawnPointsOf(topology, drawnItems);
  const [gaps, text] = buildRouteLabels({
    topology,
    drawnPoints,
    project,
    layers,
    drawnItems,
    labelDensity,
    atlas,
  });
  if (!gaps || !text) throw new Error('buildRouteLabels returned too few batches');
  return { gaps, text };
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

const airway = (layer: StyledLayer, name: string, ...at: [number, number][]) =>
  keyed(name, itemOf(layer, partOf(layer, line(...at), { name })));

/** CSS px a run of `n` characters takes at 9 px in the fixture's atlas. */
const widthOf = (n: number) => (n * atlas.advance * 9) / atlas.fontSize;

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

  it('labels airways from their density and never a direct route', () => {
    // Arrange
    const rows: [StyledLayer, number[]][] = [
      ['conv', [0, 0, 1, 1]],
      ['rnav', [0, 0, 1, 1]],
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
});
