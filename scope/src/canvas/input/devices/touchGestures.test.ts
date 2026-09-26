import { describe, expect, it } from 'bun:test';

import { isDoubleTap } from './touchGestures';

describe('isDoubleTap', () => {
  it('pairs a touch-down with a tap only when it lands soon and nearby', () => {
    // Arrange
    const tap = { x: 100, y: 100, t: 1000 };
    const cases = [
      { down: { x: 110, y: 95, t: 1200 }, want: true },
      { down: { x: 100, y: 100, t: 1400 }, want: false },
      { down: { x: 160, y: 100, t: 1100 }, want: false },
    ];

    // Act
    const got = cases.map((c) => isDoubleTap(tap, c.down));

    // Assert
    expect(got).toEqual(cases.map((c) => c.want));
  });

  it('is never a double tap without an earlier tap', () => {
    // Arrange
    const down = { x: 100, y: 100, t: 1000 };

    // Act
    const got = isDoubleTap(null, down);

    // Assert
    expect(got).toBe(false);
  });
});
