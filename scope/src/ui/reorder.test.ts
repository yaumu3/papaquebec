import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import { clamp } from '../lib/math';
import { EDGE_PX, EDGE_SPEED_PX, edgeSpeed, placeOf, reorderKey, slotAt } from './reorder';

/** How tall `items` stand, one under another. */
const tall = (items: readonly number[]) => items.reduce((sum, h) => sum + h, 0);

describe('slotAt', () => {
  it("reads the slot under the pointer by each item's height, kept among the places there are", () => {
    // Arrange: whole heights, which add up exactly, and a pointer at or beside the edge of an item
    const anyHeights = fc.array(fc.integer({ min: 1, max: 300 }), { minLength: 1, maxLength: 12 });
    const anyPointer = anyHeights.chain((heights) =>
      fc.record({
        heights: fc.constant(heights),
        y: fc
          .tuple(fc.nat({ max: heights.length }), fc.integer({ min: -2, max: 2 }))
          .map(([edge, off]) => tall(heights.slice(0, edge)) + off),
      }),
    );

    fc.assert(
      fc.property(anyPointer, ({ heights, y }) => {
        // Act
        const slot = slotAt(y, heights);

        // Assert
        const within = clamp(y, 0, tall(heights) - 1);
        expect(Number.isInteger(slot)).toBe(true);
        expect(tall(heights.slice(0, slot))).toBeLessThanOrEqual(within);
        expect(tall(heights.slice(0, slot + 1))).toBeGreaterThan(within);
      }),
    );
  });

  it('is the first slot with no items', () => {
    // Arrange
    const heights: number[] = [];

    // Act
    const slot = slotAt(50, heights);

    // Assert
    expect(slot).toBe(0);
  });
});

describe('placeOf', () => {
  it('puts the held item in the slot and closes the others up around it', () => {
    // Arrange: a list of some length, one of its items held over one of its slots
    const anyHold = fc.integer({ min: 1, max: 20 }).chain((count) =>
      fc.record({
        count: fc.constant(count),
        from: fc.nat({ max: count - 1 }),
        slot: fc.nat({ max: count - 1 }),
      }),
    );

    fc.assert(
      fc.property(anyHold, ({ count, from, slot }) => {
        // Act
        const places = Array.from({ length: count }, (_, i) => placeOf(i, from, slot));

        // Assert
        const others = places.filter((_, i) => i !== from);
        const free = Array.from({ length: count }, (_, place) => place).filter((p) => p !== slot);
        expect(places[from]).toBe(slot);
        expect(others).toEqual(free);
      }),
    );
  });
});

describe('edgeSpeed', () => {
  it('scrolls faster the nearer an edge the pointer is, and not at all away from both', () => {
    // Arrange
    const ys = [-10, 0, EDGE_PX / 2, EDGE_PX, 200, 400 - EDGE_PX, 400 - EDGE_PX / 2, 400, 410];

    // Act
    const speeds = ys.map((y) => edgeSpeed(y, 0, 400));

    // Assert
    expect(speeds).toEqual([
      -EDGE_SPEED_PX,
      -EDGE_SPEED_PX,
      -EDGE_SPEED_PX / 2,
      0,
      0,
      0,
      EDGE_SPEED_PX / 2,
      EDGE_SPEED_PX,
      EDGE_SPEED_PX,
    ]);
  });
});

describe('reorderKey', () => {
  it('reads Alt and an arrow as a move, Delete or Backspace as a remove, and nothing else', () => {
    // Arrange
    const presses = [
      { key: 'ArrowUp', altKey: true },
      { key: 'ArrowDown', altKey: true },
      { key: 'Delete', altKey: false },
      { key: 'Backspace', altKey: false },
      { key: 'ArrowUp', altKey: false },
      { key: 'Delete', altKey: true },
      { key: 'Enter', altKey: false },
    ];

    // Act
    const asks = presses.map(reorderKey);

    // Assert
    expect(asks).toEqual(['up', 'down', 'remove', 'remove', null, null, null]);
  });
});
