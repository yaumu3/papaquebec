import { describe, expect, it } from 'bun:test';

import type { Chart, ChartItem } from './chart';
import { DRAW_STACK, isAirwayLayer, isProcedureLayer, LAYER_GROUPS } from './layers';
import { type Layer, LAYERS, type ScopeLayer } from './mapsetFormat';
import { type LayerState, navaidsShownAt, drawnItemsOf } from './visibility';
import { allShown, hiddenExcept, shownExcept } from './visibilityFixture';

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

const keysOf = (items: readonly ChartItem[]) => items.map((item) => item.key);

/** A reader of the layers' states that counts how often the range is read. */
const counted = () => {
  const reads = { range: 0 };
  return {
    reads,
    inRange: () => {
      reads.range += 1;
      return true;
    },
  };
};

/** The states given, and every other layer hidden. */
const statesOf =
  (states: Partial<Record<Layer, LayerState>>) =>
  (layer: Layer): LayerState =>
    states[layer] ?? hiddenExcept();

describe('drawnItemsOf', () => {
  const all: Layer[] = ['ad', 'navaid', 'fix', 'ctr'];
  const chartLayers: Layer[] = ['ad', 'navaid', 'navaid', 'fix', 'ctr', 'sector'];
  const chart: Chart = chartLayers.map((layer, i) => ({ key: String(i), layer, parts: [] }));
  it('keeps the items that are shown, in chart order, and navaids only within range', () => {
    // Arrange
    const rows: {
      states: Partial<Record<Layer, LayerState>>;
      inRange: boolean;
      expected: string[];
    }[] = [
      {
        states: {
          ad: shownExcept(),
          navaid: shownExcept(),
          fix: shownExcept(),
          ctr: shownExcept(),
        },
        inRange: true,
        expected: ['0', '1', '2', '3', '4'],
      },
      {
        states: {
          ad: shownExcept(),
          navaid: shownExcept(),
          fix: shownExcept(),
          ctr: shownExcept(),
        },
        inRange: false,
        expected: ['0', '3', '4'],
      },
      {
        states: { navaid: shownExcept(), ctr: shownExcept() },
        inRange: true,
        expected: ['1', '2', '4'],
      },
      { states: {}, inRange: true, expected: [] },
      {
        states: {
          ad: shownExcept(),
          navaid: shownExcept(),
          fix: shownExcept('3'),
          ctr: shownExcept(),
        },
        inRange: true,
        expected: ['0', '1', '2', '4'],
      },
      {
        states: {
          ad: hiddenExcept(),
          navaid: hiddenExcept('2'),
          fix: hiddenExcept('3'),
          ctr: hiddenExcept(),
        },
        inRange: true,
        expected: ['2', '3'],
      },
      {
        states: { fix: shownExcept('gone'), ctr: hiddenExcept('gone') },
        inRange: true,
        expected: ['3'],
      },
      { states: { navaid: hiddenExcept('1') }, inRange: false, expected: [] },
    ];

    // Act
    const kept = rows.map((r) => drawnItemsOf(chart, all, statesOf(r.states), () => r.inRange));

    // Assert
    expect(kept.map(keysOf)).toEqual(rows.map((r) => r.expected));
  });

  it('reads the range once, however many navaids there are', () => {
    // Arrange
    const { reads, inRange } = counted();

    // Act
    const kept = drawnItemsOf(chart, all, statesOf({ navaid: shownExcept() }), inRange);

    // Assert
    expect(reads.range).toBe(1);
    expect(keysOf(kept)).toEqual(['1', '2']);
  });

  it('reads the range when a hidden navaid layer shows one item', () => {
    // Arrange
    const { reads, inRange } = counted();

    // Act
    const kept = drawnItemsOf(chart, all, statesOf({ navaid: hiddenExcept('1') }), inRange);

    // Assert
    expect(reads.range).toBe(1);
    expect(keysOf(kept)).toEqual(['1']);
  });

  it('does not read the range when no navaid item is shown', () => {
    // Arrange
    const rows = [hiddenExcept(), shownExcept('1', '2')].map((navaid) =>
      Object.assign(counted(), { navaid }),
    );

    // Act
    const kept = rows.map(({ navaid, inRange }) =>
      drawnItemsOf(chart, all, statesOf({ navaid }), inRange),
    );

    // Assert
    expect(rows.map(({ reads }) => reads.range)).toEqual([0, 0]);
    expect(kept.map(keysOf)).toEqual([[], []]);
  });

  it('leaves out the items of a layer that is not among those given', () => {
    // Arrange
    const given: Layer[] = ['sector'];

    // Act
    const kept = drawnItemsOf(chart, given, allShown, () => true);

    // Assert
    expect(keysOf(kept)).toEqual(['5']);
  });
});

describe('isAirwayLayer', () => {
  it('holds for the conventional and RNAV airways and for no other layer', () => {
    // Arrange
    const layers: ScopeLayer[] = [
      'conv',
      'rnav',
      'dct',
      'hold',
      'sid',
      'star',
      'trans',
      'ctr',
      'fix',
    ];

    // Act
    const verdicts = layers.map(isAirwayLayer);

    // Assert
    expect(verdicts).toEqual([true, true, false, false, false, false, false, false, false]);
  });
});

describe('isProcedureLayer', () => {
  it('holds for the departures, arrivals and transitions and for no other layer', () => {
    // Arrange
    const layers: ScopeLayer[] = ['sid', 'star', 'trans', 'conv', 'rnav', 'dct', 'hold', 'ctr'];

    // Act
    const verdicts = layers.map(isProcedureLayer);

    // Assert
    expect(verdicts).toEqual([true, true, true, false, false, false, false, false]);
  });
});
