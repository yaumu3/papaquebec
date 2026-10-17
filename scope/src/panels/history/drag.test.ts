import { describe, expect, it } from 'bun:test';

import { dragKeyOf, dropOf, liftLeft, overBin, slotShown } from './drag';

describe('slotShown', () => {
  it('shows the slot under the pointer, or the place the lane left while over the bin', () => {
    // Arrange
    const holds = [
      { from: 0, slot: 2, bin: false },
      { from: 0, slot: 2, bin: true },
    ];

    // Act
    const shown = holds.map(({ from, slot, bin }) => slotShown(from, slot, bin));

    // Assert
    expect(shown).toEqual([2, 0]);
  });
});

describe('dropOf', () => {
  it('removes a lane released over the bin, and moves it to its slot anywhere else', () => {
    // Arrange
    const releases = [
      { from: 1, slot: 3, bin: false },
      { from: 1, slot: 3, bin: true },
    ];

    // Act
    const drops = releases.map(({ from, slot, bin }) => dropOf(from, slot, bin));

    // Assert
    expect(drops).toEqual([{ move: 1, to: 3 }, 'remove']);
  });
});

describe('liftLeft', () => {
  it('keeps the lifted chip where it was taken hold of under the pointer, whole inside the bay', () => {
    // Arrange
    const pointers = [150, 20, 390];

    // Act
    const lefts = pointers.map((x) => liftLeft(x, 30, 400, 100));

    // Assert
    expect(lefts).toEqual([120, 0, 300]);
  });
});

describe('overBin', () => {
  it('counts the pointer over the bin only where the view of the lanes shows it', () => {
    // Arrange
    const bin = { left: 0, right: 100, top: 300, bottom: 326 };
    const view = { left: 0, right: 100, top: 0, bottom: 310 };
    const pointers: [number, number][] = [
      [50, 305],
      [50, 320],
      [50, 290],
      [150, 305],
    ];

    // Act
    const over = pointers.map(([x, y]) => overBin(x, y, bin, view));

    // Assert
    expect(over).toEqual([true, false, false, false]);
  });
});

describe('dragKeyOf', () => {
  it('lets go on Esc, and keeps every other key from the page', () => {
    // Arrange
    const keys = ['Escape', 'Delete', 'Backspace', 'ArrowDown', 'a'];

    // Act
    const asks = keys.map(dragKeyOf);

    // Assert
    expect(asks).toEqual(['cancel', 'keep', 'keep', 'keep', 'keep']);
  });
});
