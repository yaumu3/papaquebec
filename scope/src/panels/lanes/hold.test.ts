import { describe, expect, it } from 'bun:test';

import {
  DOUBLE_TAP_MS,
  DOUBLE_TAP_PX,
  HOLD_MS,
  HOLD_SLOP_PX,
  isDoubleTap,
  keepsTouch,
  laneGestureOf,
  PICKER_HOLD_MS,
  pinchesFrom,
  touchHoldOf,
} from './hold';

describe('laneGestureOf', () => {
  it('drags with a mouse or pen moved vertically first past the slop, however soon, by the row or the plot', () => {
    // Arrange
    const moves = [
      ['row', 'mouse', 2, 3, 0],
      ['row', 'mouse', 0, 5, 0],
      ['plot', 'mouse', 1, 5, 0],
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

  it('selects with a mouse or pen moved sideways first on a history lane, by the row or the plot', () => {
    // Arrange
    const moves = [
      ['row', 'mouse', 5, 0],
      ['plot', 'mouse', -5, 1],
      ['plot', 'pen', 5, 0],
      ['plot', 'mouse', 3, 0],
    ] as const;

    // Act
    const gestures = moves.map(([part, pointer, dx, dy]) =>
      laneGestureOf(part, pointer, dx, dy, 0, 4),
    );

    // Assert
    expect(gestures).toEqual(['select', 'select', 'select', null]);
  });

  it('drags an instrument with a mouse or pen in any direction', () => {
    // Arrange
    const moves = [
      ['mouse', 5, 0],
      ['mouse', 0, 5],
      ['pen', -5, 1],
      ['mouse', 3, 0],
    ] as const;

    // Act
    const gestures = moves.map(([pointer, dx, dy]) =>
      laneGestureOf('instrument', pointer, dx, dy, 0, 4),
    );

    // Assert
    expect(gestures).toEqual(['drag', 'drag', 'drag', null]);
  });

  it('drags with a finger held still for the hold, by the row or the plot alike', () => {
    // Arrange
    const moves = [
      ['row', HOLD_SLOP_PX, 0, HOLD_MS - 1],
      ['row', HOLD_SLOP_PX, 0, HOLD_MS],
      ['plot', 0, HOLD_SLOP_PX, HOLD_MS - 1],
      ['plot', 0, HOLD_SLOP_PX, HOLD_MS],
      ['instrument', 0, HOLD_SLOP_PX, HOLD_MS],
    ] as const;

    // Act
    const gestures = moves.map(([part, dx, dy, ms]) => laneGestureOf(part, 'touch', dx, dy, ms, 4));

    // Assert
    expect(gestures).toEqual([null, 'drag', null, 'drag', 'drag']);
  });

  it('swipes the row or peeks on a plot with a finger moved sideways first, and leaves any other first move to the page', () => {
    // Arrange
    const moves = [
      ['row', -(HOLD_SLOP_PX + 1), 0, 0],
      ['row', 0, HOLD_SLOP_PX + 1, 0],
      ['row', HOLD_SLOP_PX + 1, 0, HOLD_MS],
      ['plot', -(HOLD_SLOP_PX + 1), 0, 0],
      ['plot', 0, HOLD_SLOP_PX + 1, HOLD_MS],
      ['instrument', -(HOLD_SLOP_PX + 1), 0, 0],
    ] as const;

    // Act
    const gestures = moves.map(([part, dx, dy, ms]) => laneGestureOf(part, 'touch', dx, dy, ms, 4));

    // Assert
    expect(gestures).toEqual(['swipe', 'pass', 'swipe', 'peek', 'pass', 'pass']);
  });
});

describe('touchHoldOf', () => {
  it('lifts a lane held to HOLD_MS, not before', () => {
    // Arrange
    const holds = [HOLD_MS - 1, HOLD_MS];

    // Act
    const gestures = holds.map((ms) => touchHoldOf('pressed', 'plot', 0, 0, ms));

    // Assert
    expect(gestures).toEqual([null, 'lift']);
  });

  it('opens the picker of a lifted lane held within the slop to PICKER_HOLD_MS, not before', () => {
    // Arrange
    const holds = [PICKER_HOLD_MS - 1, PICKER_HOLD_MS];

    // Act
    const gestures = holds.map((ms) => touchHoldOf('lifted', 'plot', 0, HOLD_SLOP_PX, ms));

    // Assert
    expect(gestures).toEqual([null, 'picker']);
  });

  it('drags a lane moved past the slop once lifted, and again once its picker is open', () => {
    // Arrange
    const stages = ['lifted', 'picker'] as const;

    // Act
    const gestures = stages.map((stage) =>
      touchHoldOf(stage, 'plot', 0, HOLD_SLOP_PX + 1, PICKER_HOLD_MS),
    );

    // Assert
    expect(gestures).toEqual(['drag', 'drag']);
  });

  it('leaves a lane with its picker open alone while the finger stays within the slop', () => {
    // Arrange
    const holds = [HOLD_MS, PICKER_HOLD_MS + 500];

    // Act
    const gestures = holds.map((ms) => touchHoldOf('picker', 'row', 3, 3, ms));

    // Assert
    expect(gestures).toEqual([null, null]);
  });

  it('peeks on a plot, swipes the row and leaves an instrument to the page when moved sideways first', () => {
    // Arrange
    const parts = ['plot', 'row', 'instrument'] as const;

    // Act
    const gestures = parts.map((part) =>
      touchHoldOf('pressed', part, HOLD_SLOP_PX + 1, 0, HOLD_MS - 1),
    );

    // Assert
    expect(gestures).toEqual(['peek', 'swipe', 'pass']);
  });

  it('passes to the page when moved vertically first, before the lane is lifted', () => {
    // Arrange
    const parts = ['plot', 'row', 'instrument'] as const;

    // Act
    const gestures = parts.map((part) =>
      touchHoldOf('pressed', part, 0, HOLD_SLOP_PX + 1, HOLD_MS - 1),
    );

    // Assert
    expect(gestures).toEqual(['pass', 'pass', 'pass']);
  });
});

describe('keepsTouch', () => {
  it("keeps a finger's moves from the sheet at every stage of a gesture on a lane, and from scrolling once it drags, swipes, peeks or picks", () => {
    // Arrange
    const rest = { drag: false, swipe: false, holding: false, picking: false, peeking: false };
    const stages = [
      rest,
      { ...rest, holding: true },
      { ...rest, drag: true },
      { ...rest, swipe: true },
      { ...rest, picking: true },
      { ...rest, peeking: true },
    ];

    // Act
    const kept = stages.map(keepsTouch);

    // Assert
    expect(kept).toEqual([
      { prevent: false, stop: false },
      { prevent: false, stop: true },
      { prevent: true, stop: true },
      { prevent: true, stop: true },
      { prevent: true, stop: true },
      { prevent: true, stop: true },
    ]);
  });
});

describe('pinchesFrom', () => {
  it('lets a second finger pinch only while the first rests or peeks on a history lane', () => {
    // Arrange
    const none = { holding: false, peeking: false, drag: false, swipe: false, picking: false };
    const rows = [
      { g: { ...none, holding: true }, part: 'plot' },
      { g: { ...none, holding: true }, part: 'row' },
      { g: { ...none, peeking: true }, part: 'plot' },
      { g: { ...none, holding: true }, part: 'instrument' },
      { g: { ...none, peeking: true }, part: 'instrument' },
      { g: { ...none, holding: true, drag: true }, part: 'plot' },
      { g: { ...none, peeking: true, swipe: true }, part: 'row' },
      { g: { ...none, holding: true, picking: true }, part: 'plot' },
      { g: none, part: 'plot' },
    ] as const;

    // Act
    const pinches = rows.map((r) => pinchesFrom(r.g, r.part));

    // Assert
    expect(pinches).toEqual([true, true, true, false, false, false, false, false, false]);
  });
});

describe('isDoubleTap', () => {
  it('takes a tap close in time and place to the one before, and no other', () => {
    // Arrange
    const first = { x: 100, y: 200, at: 1000 };
    const rows = [
      { prev: first, tap: { x: 102, y: 201, at: 1150 } },
      { prev: first, tap: { x: 100, y: 200, at: 1000 + DOUBLE_TAP_MS } },
      { prev: first, tap: { x: 100, y: 200, at: 1000 + DOUBLE_TAP_MS + 1 } },
      { prev: first, tap: { x: 100 + DOUBLE_TAP_PX + 1, y: 200, at: 1100 } },
      { prev: null, tap: { x: 100, y: 200, at: 1100 } },
    ];

    // Act
    const doubles = rows.map((r) => isDoubleTap(r.prev, r.tap));

    // Assert
    expect(doubles).toEqual([true, true, false, false, false]);
  });
});
