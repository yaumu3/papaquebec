import { describe, expect, it } from 'bun:test';

import { HOLD_MS, HOLD_SLOP_PX, plotGestureOf } from './hold';

describe('plotGestureOf', () => {
  it('drags with a mouse or pen once past the slop, however soon', () => {
    // Arrange
    const moves = [
      ['mouse', 3, 2, 0],
      ['mouse', 5, 0, 0],
      ['pen', 0, -5, 0],
      ['pen', 2, 2, HOLD_MS],
    ] as const;

    // Act
    const gestures = moves.map(([pointer, dx, dy, ms]) => plotGestureOf(pointer, dx, dy, ms, 4));

    // Assert
    expect(gestures).toEqual([null, 'drag', 'drag', null]);
  });

  it('drags with a finger held still for the hold, and leaves one that moves first to the page', () => {
    // Arrange
    const moves = [
      [HOLD_SLOP_PX, 0, HOLD_MS - 1],
      [HOLD_SLOP_PX, 0, HOLD_MS],
      [0, HOLD_SLOP_PX + 1, 0],
      [HOLD_SLOP_PX + 1, 0, HOLD_MS],
    ] as const;

    // Act
    const gestures = moves.map(([dx, dy, ms]) => plotGestureOf('touch', dx, dy, ms, 4));

    // Assert
    expect(gestures).toEqual([null, 'drag', 'pass', 'pass']);
  });
});
