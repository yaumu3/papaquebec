import { describe, expect, it } from 'bun:test';

import { HOLD_MS, HOLD_SLOP_PX, laneGestureOf } from './hold';

describe('laneGestureOf', () => {
  it('drags with a mouse or pen once past the slop, however soon, by the row or the plot', () => {
    // Arrange
    const moves = [
      ['row', 'mouse', 3, 2, 0],
      ['row', 'mouse', 5, 0, 0],
      ['plot', 'mouse', 5, 0, 0],
      ['plot', 'pen', 0, -5, 0],
      ['row', 'pen', 2, 2, HOLD_MS],
    ] as const;

    // Act
    const gestures = moves.map(([part, pointer, dx, dy, ms]) =>
      laneGestureOf(part, pointer, dx, dy, ms, 4),
    );

    // Assert
    expect(gestures).toEqual([null, 'drag', 'drag', 'drag', null]);
  });

  it('drags with a finger held still for the hold, by the row or the plot alike', () => {
    // Arrange
    const moves = [
      ['row', HOLD_SLOP_PX, 0, HOLD_MS - 1],
      ['row', HOLD_SLOP_PX, 0, HOLD_MS],
      ['plot', 0, HOLD_SLOP_PX, HOLD_MS - 1],
      ['plot', 0, HOLD_SLOP_PX, HOLD_MS],
    ] as const;

    // Act
    const gestures = moves.map(([part, dx, dy, ms]) => laneGestureOf(part, 'touch', dx, dy, ms, 4));

    // Assert
    expect(gestures).toEqual([null, 'drag', null, 'drag']);
  });

  it('swipes the row with a finger moved sideways first, and leaves any other first move to the page', () => {
    // Arrange
    const moves = [
      ['row', -(HOLD_SLOP_PX + 1), 0, 0],
      ['row', 0, HOLD_SLOP_PX + 1, 0],
      ['row', HOLD_SLOP_PX + 1, 0, HOLD_MS],
      ['plot', -(HOLD_SLOP_PX + 1), 0, 0],
      ['plot', 0, HOLD_SLOP_PX + 1, HOLD_MS],
    ] as const;

    // Act
    const gestures = moves.map(([part, dx, dy, ms]) => laneGestureOf(part, 'touch', dx, dy, ms, 4));

    // Assert
    expect(gestures).toEqual(['swipe', 'pass', 'swipe', 'pass', 'pass']);
  });
});
