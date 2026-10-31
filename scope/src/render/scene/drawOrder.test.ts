import { describe, expect, it } from 'bun:test';

import { type ChartItem, chartOf, type ItemPart } from '../../lib/chart';
import { DRAW_STACK, type ScopeLayer, type StyledLayer } from '../../lib/layers';
import { parseMapSet } from '../../lib/mapset';
import { EXAMPLE } from '../../lib/mapsetCorpus';
import { POINT_LAYERS } from '../../lib/mapsetFormat';
import { type Batch, LINE_STRIDE, MARKER_STRIDE, TEXT_STRIDE } from '../protocol';
import { CHART_SLICES, SLOT_ORDER, type Slots, sliceSlots } from '../slots';
import { atlas } from './atlasFixture';
import { buildChart, visibleLayers } from './chart';
import { buildCoast, buildRings } from './static';

const project = (lat: number, lon: number) => ({ x: lon, y: lat });
const at = (layer: ScopeLayer) => DRAW_STACK.indexOf(layer);
const isPoint = (layer: ScopeLayer): layer is (typeof POINT_LAYERS)[number] =>
  (POINT_LAYERS as readonly string[]).includes(layer);
const CHART_LAYERS: StyledLayer[] = CHART_SLICES.flatMap((s) => s.layers);

/** An item of `layer`, one glyph in its name, sitting at x = its place in the stack. */
function itemAt(layer: StyledLayer): ChartItem {
  const x = at(layer);
  const part: ItemPart = isPoint(layer)
    ? { geometry: { type: 'Point', coordinates: [x, 0] }, properties: { layer, id: 'Q' } }
    : {
        geometry: {
          type: 'LineString',
          coordinates: [
            [x, 0],
            [x + 0.01, 0],
          ],
        },
        properties: { layer, name: 'Q' },
      };
  return { key: layer, layer, parts: [part] };
}

/** Everything the scope draws from the map, as the effects post it. */
function mapSlots(chart: ChartItem[]): Slots {
  const slots: Slots = {};
  for (const slice of CHART_SLICES) {
    const layers = visibleLayers(
      slice.layers,
      () => true,
      () => true,
    );
    const built = buildChart({ chart, project, layers, labelDensity: 'dense', atlas });
    Object.assign(slots, sliceSlots(slice, built));
  }
  const coastX = at('coast');
  const coast = {
    lines: [
      [
        [coastX, 0],
        [coastX + 0.01, 0],
      ] as [number, number][],
    ],
  };
  Object.assign(slots, buildCoast({ shown: true, coast, project }));
  const ringX = at('rings');
  const ringPath = () => [
    { x: ringX, y: 0 },
    { x: ringX + 0.01, y: 0 },
  ];
  Object.assign(slots, buildRings({ shown: true, rangeNm: 5, ringExtentNm: 5, ringPath, atlas }));
  return slots;
}

/** The x each instance is anchored at, in the order the renderer draws them. */
function xsInDrawOrder(slots: Slots, kind: Batch['kind']): number[] {
  const stride = { lines: LINE_STRIDE, markers: MARKER_STRIDE, text: TEXT_STRIDE }[kind];
  return SLOT_ORDER.flatMap((name) => slots[name] ?? [])
    .filter((b) => b.kind === kind)
    .flatMap((b) => Array.from({ length: b.count }, (_, i) => Math.round(b.data[i * stride] ?? 0)));
}

describe('the draw order of the chart', () => {
  const chart = CHART_LAYERS.map(itemAt);
  const behind = DRAW_STACK.toReversed();
  const unlabelled: ReadonlySet<ScopeLayer> = new Set(['fir', 'adiz', 'dct', 'hold', 'coast']);

  it('draws lines back to front through the stack, the base map first', () => {
    // Arrange
    const lineLayers = behind.filter((l) => !isPoint(l) && l !== 'hold');

    // Act
    const slots = mapSlots(chart);

    // Assert
    expect(xsInDrawOrder(slots, 'lines')).toEqual(lineLayers.map(at));
  });

  it('draws the markers after every line, back to front', () => {
    // Arrange
    const pointLayers = behind.filter(isPoint);

    // Act
    const slots = mapSlots(chart);

    // Assert
    expect(xsInDrawOrder(slots, 'markers')).toEqual(pointLayers.map(at));
  });

  it('draws every label after every line and marker, back to front, the ring labels first', () => {
    // Arrange
    const labelled = behind.filter((l) => !unlabelled.has(l));

    // Act
    const slots = mapSlots(chart);

    // Assert
    expect(xsInDrawOrder(slots, 'text')).toEqual(labelled.map(at));
  });
});

describe('the example map set', () => {
  it('draws every layer but hold', () => {
    // Arrange
    const items = chartOf([parseMapSet(EXAMPLE)]);

    // Act
    const undrawn = CHART_LAYERS.filter((layer) => {
      const { lines, markers } = buildChart({
        chart: items,
        project,
        layers: [layer],
        labelDensity: 'off',
        atlas,
      });
      return lines.count + markers.count === 0;
    });

    // Assert
    expect(undrawn).toEqual([]);
  });
});
