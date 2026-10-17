import { describe, expect, it } from 'bun:test';

import { EDGE_PX, EDGE_SPEED_PX, edgeSpeed, placeOf, reorderKey, slotAt } from './reorder';

describe('slotAt', () => {
  it('reads the slot under the pointer by the pitch, kept among the places there are', () => {
    // Arrange
    const ys = [-20, 0, 84, 85, 200, 400];

    // Act
    const slots = ys.map((y) => slotAt(y, 85, 3));

    // Assert
    expect(slots).toEqual([0, 0, 0, 1, 2, 2]);
  });
});

describe('placeOf', () => {
  it('puts the held item in the slot and closes the others up around it', () => {
    // Arrange
    const holds = [
      { from: 0, slot: 2 },
      { from: 3, slot: 1 },
      { from: 1, slot: 1 },
    ];

    // Act
    const places = holds.map(({ from, slot }) => [0, 1, 2, 3].map((i) => placeOf(i, from, slot)));

    // Assert
    expect(places).toEqual([
      [2, 0, 1, 3],
      [0, 2, 3, 1],
      [0, 1, 2, 3],
    ]);
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
