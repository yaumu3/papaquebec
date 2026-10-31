import { describe, expect, it } from 'bun:test';

import { capped, everyItemSet, isItemShown, itemsSetTo, type LayerState } from './visibility';
import { hiddenExcept, plainState, shownExcept } from './visibilityFixture';

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
