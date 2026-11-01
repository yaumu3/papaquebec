import { describe, expect, it } from 'bun:test';

import type { Batch, BatchKind } from './protocol';
import {
  CHART_SLICES,
  drawSteps,
  LABEL_SLOTS,
  labelSlots,
  shapeSlots,
  SLOT_ORDER,
  type SlotName,
} from './slots';

const batch = (kind: Batch['kind']): Batch => ({ kind, data: new Float32Array(), count: 0 });

describe('SLOT_ORDER', () => {
  it('draws the base map, then the chart, its markers over its labels, then the traces, then what moves', () => {
    // Arrange
    const expected = [
      'ringLines',
      'coastLines',
      'areaLines',
      'routeLines',
      'ringLabels',
      'areaLabels',
      'routeLabels',
      'pointLabels',
      'pointMarkers',
      'traces',
      'targets',
      'hover',
      'overlays',
    ];

    // Act
    const order: string[] = [...SLOT_ORDER];

    // Assert
    expect(order).toEqual(expected);
  });
});

describe('CHART_SLICES', () => {
  it('cuts the draw stack into the areas, the routes and procedures, and the points', () => {
    // Arrange
    const expected = [
      ['ctr', 'asr'],
      ['sid', 'dct'],
      ['ad', 'vfr'],
    ];

    // Act
    const ends: (string | undefined)[][] = CHART_SLICES.map(({ layers }) => [
      layers[0],
      layers.at(-1),
    ]);

    // Assert
    expect(ends).toEqual(expected);
  });
});

describe('shapeSlots', () => {
  it('files the lines and markers under the slice', () => {
    // Arrange
    const shapes = { lines: batch('lines'), markers: batch('markers') };
    const [areas] = CHART_SLICES;

    // Act
    const slots = shapeSlots(areas, shapes);

    // Assert
    expect(slots).toEqual({ areaLines: [shapes.lines, shapes.markers] });
  });
});

describe('labelSlots', () => {
  it('files the labels under the slice label slot', () => {
    // Arrange
    const labels = [batch('text')];
    const [areas] = CHART_SLICES;

    // Act
    const slots = labelSlots(areas, labels);

    // Assert
    expect(slots).toEqual({ areaLabels: labels });
  });
});

const held = (entries: [SlotName, BatchKind[]][]) =>
  new Map(entries.map(([slot, kinds]) => [slot, kinds.map((kind) => ({ kind }))]));

const isLabel = (slot: SlotName) => LABEL_SLOTS.includes(slot);

describe('drawSteps', () => {
  const slots = held([
    ['routeLines', ['lines']],
    ['ringLabels', ['text']],
    ['areaLabels', ['text']],
    ['routeLabels', ['lines', 'text']],
    ['pointLabels', ['text']],
    ['pointMarkers', ['markers']],
    ['targets', ['text']],
  ]);

  it('draws the halos of every label before any label glyph', () => {
    // Arrange
    const labelled = LABEL_SLOTS.filter((slot) => slots.has(slot));

    // Act
    const steps = drawSteps(slots);

    // Assert
    const passes = steps.filter((s) => isLabel(s.slot)).map((s) => s.pass);
    expect(passes.filter((pass) => pass === 'halo')).toHaveLength(labelled.length);
    expect(passes.lastIndexOf('halo')).toBeLessThan(passes.indexOf('text'));
  });

  it('keeps every other batch in slot order, the lines of a label slot between its halos and glyphs', () => {
    // Arrange
    const expected = [
      'routeLines/0/lines',
      'ringLabels/0/halo',
      'areaLabels/0/halo',
      'routeLabels/1/halo',
      'pointLabels/0/halo',
      'ringLabels/0/text',
      'areaLabels/0/text',
      'routeLabels/0/lines',
      'routeLabels/1/text',
      'pointLabels/0/text',
      'pointMarkers/0/markers',
      'targets/0/text',
    ];

    // Act
    const steps = drawSteps(slots);

    // Assert
    expect(steps.map((s) => `${s.slot}/${s.index}/${s.pass}`)).toEqual(expected);
  });
});
