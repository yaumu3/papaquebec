import { describe, expect, it } from 'bun:test';

import { dragZoomFactor, isDoubleTap, pinchOf } from './touchGestures';

describe('pinchOf', () => {
  it('scales by the change in finger spread about the midpoint, which follows the fingers', () => {
    // Arrange
    const start = [
      { x: 300, y: 300 },
      { x: 500, y: 300 },
    ] as const;
    const now = [
      { x: 250, y: 320 },
      { x: 650, y: 320 },
    ] as const;

    // Act
    const out = pinchOf(start, now);

    // Assert
    expect(out).toEqual({ anchor: { x: 400, y: 300 }, factor: 0.5, to: { x: 450, y: 320 } });
  });
});

describe('dragZoomFactor', () => {
  it('zooms in as the finger drags up and out as it drags down', () => {
    // Arrange
    const drags = [-150, 150];

    // Act
    const factors = drags.map(dragZoomFactor);

    // Assert
    expect(factors).toEqual([0.5, 2]);
  });
});

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
