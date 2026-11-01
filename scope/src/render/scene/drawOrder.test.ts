import { describe, expect, it } from 'bun:test';

import type { Chart, ChartItem } from '../../lib/chart';
import { DRAW_STACK, LAYER_TABLE } from '../../lib/layers';
import { type Layer, POINT_LAYERS, type ScopeLayer } from '../../lib/mapsetFormat';
import { type Batch, LINE_STRIDE, MARKER_STRIDE, TEXT_STRIDE } from '../protocol';
import { LABEL_SLOTS, type Slots, SLOT_ORDER, type SlotName } from '../slots';
import { atlas } from './atlasFixture';
import { CHART_SLICES } from './chart';
import { itemOf, line, partOf, point, project, sceneOf } from './chartFixture';
import { buildCoast, buildRings } from './static';

const at = (layer: ScopeLayer) => LAYER_TABLE[layer].rank;
const isPoint = (layer: ScopeLayer): layer is (typeof POINT_LAYERS)[number] =>
  (POINT_LAYERS as readonly string[]).includes(layer);
const CHART_LAYERS: Layer[] = CHART_SLICES.flatMap((s) => s.layers);

/** An item of `layer`, one glyph in its name, sitting at x = its place in the stack. */
function itemAt(layer: Layer): ChartItem {
  const x = at(layer);
  const geometry = layer === 'hold' || isPoint(layer) ? point([x, 0]) : line([x, 0], [x + 0.01, 0]);
  return itemOf(layer, partOf(layer, geometry));
}

/** Everything the scope draws from the map, as the effects post it. */
function mapSlots(chart: Chart): Slots {
  const slots = sceneOf(chart, { scale: 1e6 }).slots();
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

/** The slots of shapes: a route label slot also holds the gaps it cuts in lines. */
const SHAPE_SLOTS = SLOT_ORDER.filter((name) => !LABEL_SLOTS.includes(name));

/** The x each instance is anchored at, in the order the renderer draws them. */
function xsInDrawOrder(
  slots: Slots,
  kind: Batch['kind'],
  names: readonly SlotName[] = SLOT_ORDER,
): number[] {
  const stride = { lines: LINE_STRIDE, markers: MARKER_STRIDE, text: TEXT_STRIDE }[kind];
  return names
    .flatMap((name) => slots[name] ?? [])
    .filter((b) => b.kind === kind)
    .flatMap((b) => Array.from({ length: b.count }, (_, i) => Math.round(b.data[i * stride] ?? 0)));
}

/** A list with each run of equal values as one: a layer's many instances at one place. */
const oneEach = (xs: readonly number[]) => xs.filter((x, i) => x !== xs[i - 1]);

/** The kind of each non-empty batch, in the order the renderer draws them. */
const kindsInDrawOrder = (slots: Slots): Batch['kind'][] =>
  SLOT_ORDER.flatMap((name) => slots[name] ?? [])
    .filter((b) => b.count > 0)
    .map((b) => b.kind);

describe('the draw order of the chart', () => {
  const chart = CHART_LAYERS.map(itemAt);
  const behind = DRAW_STACK.toReversed();
  const unlabelled: ReadonlySet<ScopeLayer> = new Set(['fir', 'adiz', 'dct', 'hold', 'coast']);

  it('draws lines back to front through the stack, the base map first, the navaid strokes last', () => {
    // Arrange
    const lineLayers = behind.filter((l) => !isPoint(l));

    // Act
    const slots = mapSlots(chart);

    // Assert
    expect(oneEach(xsInDrawOrder(slots, 'lines', SHAPE_SLOTS))).toEqual([
      ...lineLayers.map(at),
      at('navaid'),
    ]);
  });

  it('draws the markers back to front', () => {
    // Arrange
    const pointLayers = behind.filter(isPoint);

    // Act
    const slots = mapSlots(chart);

    // Assert
    expect(xsInDrawOrder(slots, 'markers')).toEqual(pointLayers.map(at));
  });

  it('draws every label after every line, back to front, the ring labels first', () => {
    // Arrange
    const labelled = behind.filter((l) => !unlabelled.has(l));

    // Act
    const slots = mapSlots(chart);

    // Assert
    expect(xsInDrawOrder(slots, 'text')).toEqual(labelled.map(at));
  });

  it('draws the markers after every label, the ring labels included', () => {
    // Arrange
    const slots = mapSlots(chart);

    // Act
    const kinds = kindsInDrawOrder(slots);

    // Assert
    expect(kinds.indexOf('markers')).toBeGreaterThan(kinds.lastIndexOf('text'));
  });
});

/** The halo of every glyph of a slot. */
const haloOf = (slots: Slots, name: SlotName) =>
  (slots[name] ?? [])
    .filter((b) => b.kind === 'text')
    .flatMap(({ data, count }) =>
      Array.from({ length: count }, (_, i) => data[i * TEXT_STRIDE + 15] ?? 0),
    );

describe('the halo of a label', () => {
  it('is on every map label and on no ring label', () => {
    // Arrange
    const slots = mapSlots(CHART_LAYERS.map(itemAt));
    const mapLabels: SlotName[] = ['areaLabels', 'routeLabels', 'pointLabels'];

    // Act
    const halos = [...mapLabels, 'ringLabels' as const].map((name) => haloOf(slots, name));

    // Assert
    const [areas = [], routes = [], points = [], rings = []] = halos;
    expect([areas.length, routes.length, points.length, rings.length].every((n) => n > 0)).toBe(
      true,
    );
    expect([...areas, ...routes, ...points].every((h) => h > 0)).toBe(true);
    expect(rings.every((h) => h === 0)).toBe(true);
  });
});
