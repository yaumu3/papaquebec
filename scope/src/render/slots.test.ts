import { describe, expect, it } from 'bun:test';

import type { Batch } from './protocol';
import { CHART_SLICES, SLOT_ORDER, sliceSlots } from './slots';

const batch = (kind: Batch['kind']): Batch => ({ kind, data: new Float32Array(), count: 0 });

describe('SLOT_ORDER', () => {
  it('draws the base map, then lines, markers and labels of the chart, then what moves', () => {
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

describe('sliceSlots', () => {
  it('files the lines and markers under the slice and the labels under its label slot', () => {
    // Arrange
    const batches = { lines: batch('lines'), markers: batch('markers'), labels: batch('text') };
    const [areas] = CHART_SLICES;

    // Act
    const slots = sliceSlots(areas, batches);

    // Assert
    expect(slots).toEqual({
      areaLines: [batches.lines, batches.markers],
      areaLabels: [batches.labels],
    });
  });
});
