import { describe, expect, it } from 'bun:test';

import { createRoot } from 'solid-js';

import { hoverPlace } from './hoverPlace';

const pointer = (pointerType: string): Pick<PointerEvent, 'pointerType'> => ({ pointerType });

const helper = () => createRoot(() => hoverPlace('list', () => ['a', 'b']));

describe('hoverPlace', () => {
  it('holds the place a mouse enters, and not one a pen or touch enters', () => {
    // Arrange
    const kinds = ['mouse', 'pen', 'touch'];
    const helpers = kinds.map(helper);

    // Act
    const seen = helpers.map((h, i) => {
      h.at(1).enter(pointer(kinds[i] ?? ''));
      return h.place();
    });

    // Assert
    expect(seen).toEqual([1, null, null]);
  });

  it('keeps the place when the mouse leaves another one, and drops it on leaving its own', () => {
    // Arrange
    const leaves = [0, 1];
    const helpers = leaves.map(() => {
      const h = helper();
      h.at(1).enter(pointer('mouse'));
      return h;
    });

    // Act
    const seen = helpers.map((h, i) => {
      h.at(leaves[i] ?? 0).leave(pointer('mouse'));
      return h.place();
    });

    // Assert
    expect(seen).toEqual([1, null]);
  });

  it('drops the place when the element at it goes, and keeps it when another goes', () => {
    // Arrange
    const goes = [1, 0];
    const mounted = goes.map((i) => {
      const h = helper();
      const disposeChild = createRoot((dispose) => {
        h.at(i);
        return dispose;
      });
      h.at(1).enter(pointer('mouse'));
      return { h, disposeChild };
    });

    // Act
    const seen = mounted.map(({ h, disposeChild }) => {
      disposeChild();
      return h.place();
    });

    // Assert
    expect(seen).toEqual([null, 1]);
  });
});
