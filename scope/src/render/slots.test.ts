import { describe, expect, it } from 'bun:test';

import type { Batch } from './protocol';
import { CHART_SLICES, labelSlots, shapeSlots, SLOT_ORDER } from './slots';

const batch = (kind: Batch['kind']): Batch => ({ kind, data: new Float32Array(), count: 0 });

describe('SLOT_ORDER', () => {
  it('draws the base map, then the chart, then the traces over its labels, then what moves', () => {
    // Arrange
    const expected = [
      'ringLines',
      'coastLines',
      'areaLines',
      'routeLines',
      'pointMarkers',
      'ringLabels',
      'areaLabels',
      'routeLabels',
      'pointLabels',
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
