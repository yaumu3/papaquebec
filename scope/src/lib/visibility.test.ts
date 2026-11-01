import { describe, expect, it } from 'bun:test';

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

  it('hides the layer when the last shown item is hidden', () => {
    // Arrange
    const layer = shownExcept('a', 'b');

    // Act
    const result = itemsSetTo(layer, ['c'], false, present);

    // Assert
    expect(plainState(result)).toEqual({ mode: false, exceptions: [] });
  });

  it('leaves a hidden layer hidden when its last shown item is hidden', () => {
    // Arrange
    const layer = hiddenExcept('a');

    // Act
    const result = itemsSetTo(layer, ['a'], false, present);

    // Assert
    expect(plainState(result)).toEqual({ mode: false, exceptions: [] });
  });

  it('shows the layer when the last hidden item is shown', () => {
    // Arrange
    const layer = hiddenExcept('a', 'b');

    // Act
    const result = itemsSetTo(layer, ['c'], true, present);

    // Assert
    expect(plainState(result)).toEqual({ mode: true, exceptions: [] });
  });

  it('stores one key to show an item of a hidden layer', () => {
    // Arrange
    const layer = hiddenExcept();

    // Act
    const result = itemsSetTo(layer, ['b'], true, present);

    // Assert
    expect(plainState(result)).toEqual({ mode: false, exceptions: ['b'] });
  });

  it('clears the exception of an item set back to the mode, and stores none for one already there', () => {
    // Arrange
    const layer = shownExcept('a');

    // Act
    const result = itemsSetTo(layer, ['a', 'b'], true, present);

    // Assert
    expect(plainState(result)).toEqual({ mode: true, exceptions: [] });
  });

  it('sets several keys one way and leaves the others', () => {
    // Arrange
    const layer = shownExcept('c');

    // Act
    const result = itemsSetTo(layer, ['a', 'b'], false, [...present, 'd']);

    // Assert
    expect(plainState(result)).toEqual({ mode: true, exceptions: ['c', 'a', 'b'] });
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

  it('drops absent keys, oldest first, and no more than needed', () => {
    // Arrange
    const exceptions = new Set(['old', 'a', 'mid', 'new']);
    const present = new Set(['a']);

    // Act
    const result = capped(exceptions, present, 3);

    // Assert
    expect([...result]).toEqual(['a', 'mid', 'new']);
  });

  it('never drops a key of the chart', () => {
    // Arrange
    const exceptions = new Set(['a', 'b', 'c', 'd']);
    const present = new Set(['a', 'b', 'c', 'd']);

    // Act
    const result = capped(exceptions, present, 2);

    // Assert
    expect([...result]).toEqual(['a', 'b', 'c', 'd']);
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
