import { describe, expect, it } from 'bun:test';

import type { Chart, ChartItem } from './chart';
import {
  DRAW_STACK,
  LAYER_GROUPS,
  navaidsShownAt,
  type ScopeLayer,
  type StyledLayer,
  drawnItemsOf,
} from './layers';
import { type Layer, LAYERS } from './mapsetFormat';

type Group = [string, readonly ScopeLayer[]];

describe('DRAW_STACK', () => {
  it('holds every layer of the map set format, the coastline and the rings, each once', () => {
    // Arrange
    const expected: string[] = [...LAYERS, 'coast', 'rings'].toSorted();

    // Act
    const stack: string[] = [...DRAW_STACK].toSorted();

    // Assert
    expect(stack).toEqual(expected);
  });

  it('draws in the order of the spec, front first', () => {
    // Arrange
    const spec: string[] = [
      'ad',
      'navaid',
      'fix',
      'vfr',
      'sid',
      'star',
      'trans',
      'conv',
      'rnav',
      'dct',
      'hold',
      'ctr',
      'pr',
      'tma',
      'sector',
      'fir',
      'dng',
      'tra',
      'adiz',
      'cta',
      'advisory',
      'civt',
      'asr',
      'coast',
      'rings',
    ];

    // Act
    const stack: string[] = [...DRAW_STACK];

    // Assert
    expect(stack).toEqual(spec);
  });
});

describe('LAYER_GROUPS', () => {
  it('lists the six groups with their layers, in the order of the panel', () => {
    // Arrange
    const spec: Group[] = [
      ['POINTS', ['ad', 'navaid', 'fix', 'vfr']],
      ['ROUTES', ['conv', 'rnav', 'dct', 'hold']],
      ['PROCEDURES', ['sid', 'star', 'trans']],
      ['RESTRICTIONS', ['pr', 'dng', 'tra', 'adiz', 'civt']],
      ['AIRSPACE', ['ctr', 'tma', 'cta', 'advisory', 'sector', 'fir', 'asr']],
      ['BASE MAP', ['coast', 'rings']],
    ];

    // Act
    const listed = LAYER_GROUPS.map((g): Group => [g.title, g.layers]);

    // Assert
    expect(listed).toEqual(spec);
  });

  it('lists every layer of the stack once', () => {
    // Arrange
    const expected: string[] = [...DRAW_STACK].toSorted();

    // Act
    const listed: string[] = LAYER_GROUPS.flatMap((g) => g.layers).toSorted();

    // Assert
    expect(listed).toEqual(expected);
  });
});

describe('navaidsShownAt', () => {
  it('shows navaids out to 120 NM and hides them beyond', () => {
    // Arrange
    const ranges = [120, 121];

    // Act
    const shown = ranges.map(navaidsShownAt);

    // Assert
    expect(shown).toEqual([true, false]);
  });
});

const layersOf = (items: readonly ChartItem[]) => items.map((item) => item.layer);

describe('drawnItemsOf', () => {
  const all: StyledLayer[] = ['ad', 'navaid', 'fix', 'ctr'];
  const chartLayers: Layer[] = ['ad', 'navaid', 'navaid', 'fix', 'ctr', 'sector'];
  const chart: Chart = chartLayers.map((layer, i) => ({ key: String(i), layer, parts: [] }));

  it('keeps the items of the layers given that are shown, in chart order, and navaids only within range', () => {
    // Arrange
    const rows: {
      shown: (l: Layer) => boolean;
      inRange: boolean;
      expected: Layer[];
    }[] = [
      { shown: () => true, inRange: true, expected: ['ad', 'navaid', 'navaid', 'fix', 'ctr'] },
      { shown: () => true, inRange: false, expected: ['ad', 'fix', 'ctr'] },
      {
        shown: (l) => l !== 'ad' && l !== 'fix',
        inRange: true,
        expected: ['navaid', 'navaid', 'ctr'],
      },
      { shown: () => false, inRange: true, expected: [] },
    ];

    // Act
    const kept = rows.map((r) => drawnItemsOf(chart, all, r.shown, () => r.inRange));

    // Assert
    expect(kept.map(layersOf)).toEqual(rows.map((r) => r.expected));
  });

  it('does not read the range for a navaid layer that is hidden', () => {
    // Arrange
    let reads = 0;
    const inRange = () => {
      reads += 1;
      return true;
    };

    // Act
    const kept = drawnItemsOf(chart, all, (l) => l !== 'navaid', inRange);

    // Assert
    expect(reads).toBe(0);
    expect(layersOf(kept)).toEqual(['ad', 'fix', 'ctr']);
  });

  it('reads the range once, however many navaids there are', () => {
    // Arrange
    let reads = 0;
    const inRange = () => {
      reads += 1;
      return true;
    };

    // Act
    const kept = drawnItemsOf(chart, all, () => true, inRange);

    // Assert
    expect(reads).toBe(1);
    expect(layersOf(kept)).toContain('navaid');
  });

  it('leaves out the items of a layer that is not among those given', () => {
    // Arrange
    const given: StyledLayer[] = ['sector'];

    // Act
    const kept = drawnItemsOf(
      chart,
      given,
      () => true,
      () => true,
    );

    // Assert
    expect(layersOf(kept)).toEqual(['sector']);
  });
});
