import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import type { Chart, ChartItem } from './chart';
import type { Layer } from './mapsetFormat';
import {
  capped,
  drawnItemsOf,
  everyItemSet,
  isItemShown,
  itemsSetTo,
  type LayerState,
  navaidsShownAt,
} from './visibility';
import { allShown, hiddenExcept, plainState, shownExcept } from './visibilityFixture';

describe('isItemShown', () => {
  it('shows an item when the mode and the exception go against each other', () => {
    // Arrange
    const rows: [LayerState, boolean][] = [
      [shownExcept(), true],
      [shownExcept('a'), false],
      [hiddenExcept(), false],
      [hiddenExcept('a'), true],
    ];

    // Act
    const verdicts = rows.map(([layer]) => isItemShown(layer, 'a'));

    // Assert
    expect(verdicts).toEqual(rows.map(([, expected]) => expected));
  });
});

describe('everyItemSet', () => {
  it('sets the mode and clears the exceptions', () => {
    // Arrange
    const on = true;

    // Act
    const result = everyItemSet(on);

    // Assert
    expect(plainState(result)).toEqual({ mode: true, exceptions: [] });
  });
});

describe('itemsSetTo', () => {
  const present = ['a', 'b', 'c'];

  it('shows or hides the items named and leaves the others, flipping the mode once every item goes against it', () => {
    // Arrange: a few keys, so that a set often reaches the last item of the chart
    const KEYS = ['a', 'b', 'c', 'd', 'e'];
    const anyLayer = fc.record({
      mode: fc.boolean(),
      exceptions: fc.subarray([...KEYS, 'gone1', 'gone2']).map((keys) => new Set(keys)),
    });
    const anyItems = fc
      .subarray(KEYS, { minLength: 1 })
      .chain((inChart) => fc.record({ inChart: fc.constant(inChart), keys: fc.subarray(inChart) }));

    fc.assert(
      fc.property(anyLayer, anyItems, fc.boolean(), (layer, { inChart, keys }, on) => {
        // Act
        const result = itemsSetTo(layer, keys, on, inChart);

        // Assert
        const others = inChart.filter((key) => !keys.includes(key));
        expect(keys.map((key) => isItemShown(result, key))).toEqual(keys.map(() => on));
        expect(others.map((key) => isItemShown(result, key))).toEqual(
          others.map((key) => isItemShown(layer, key)),
        );
        expect(inChart.every((key) => result.exceptions.has(key))).toBe(false);
      }),
    );
  });

  it('keeps the exception of an absent item through a set', () => {
    // Arrange
    const layer = hiddenExcept('gone');

    // Act
    const result = itemsSetTo(layer, ['a'], true, present);

    // Assert
    expect(plainState(result)).toEqual({ mode: false, exceptions: ['gone', 'a'] });
  });

  it('drops the exception of an absent item when the mode flips', () => {
    // Arrange
    const layer = hiddenExcept('gone');

    // Act
    const result = itemsSetTo(layer, present, true, present);

    // Assert
    expect(plainState(result)).toEqual({ mode: true, exceptions: [] });
  });

  it('caps the exceptions, keeping every key of the chart', () => {
    // Arrange
    const layer = shownExcept('gone1', 'gone2');

    // Act
    const result = itemsSetTo(layer, ['a'], false, present, 2);

    // Assert
    expect(plainState(result)).toEqual({ mode: true, exceptions: ['gone2', 'a'] });
  });
});

describe('capped', () => {
  it('returns the same set when it is within the cap', () => {
    // Arrange
    const exceptions = new Set(['a', 'b', 'c']);

    // Act
    const result = capped(exceptions, new Set(), 3);

    // Assert
    expect(result).toBe(exceptions);
  });

  it('drops absent keys, oldest first, no more than needed, and never a key of the chart', () => {
    // Arrange
    const KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const anyExceptions = fc.shuffledSubarray(KEYS);
    const anyPresent = fc.subarray(KEYS).map((keys) => new Set(keys));
    const anyMax = fc.nat({ max: KEYS.length });

    fc.assert(
      fc.property(anyExceptions, anyPresent, anyMax, (exceptions, present, max) => {
        // Act
        const result = capped(new Set(exceptions), present, max);

        // Assert
        const absent = exceptions.filter((key) => !present.has(key));
        const dropped = exceptions.filter((key) => !result.has(key));
        const over = Math.max(0, exceptions.length - max);
        expect([...result]).toEqual(exceptions.filter((key) => result.has(key)));
        expect(dropped).toEqual(absent.slice(0, Math.min(over, absent.length)));
      }),
    );
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
