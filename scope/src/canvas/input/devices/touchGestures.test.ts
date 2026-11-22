import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import { dragZoomFactor, isDoubleTap, pinchOf } from './touchGestures';

/** Two fingers `halfSpread` either side of `mid`, on a line at `angle`. */
function fingers(mid: { x: number; y: number }, halfSpread: number, angle: number) {
  const reach = { x: halfSpread * Math.cos(angle), y: halfSpread * Math.sin(angle) };
  return [
    { x: mid.x - reach.x, y: mid.y - reach.y },
    { x: mid.x + reach.x, y: mid.y + reach.y },
  ] as const;
}

describe('pinchOf', () => {
  it('scales by the change in finger spread about the midpoint, which follows the fingers', () => {
    // Arrange: fingers some way apart, then spread or closed by a share, turned and moved together
    const anyPx = fc.double({ min: 0, max: 1000, noNaN: true });
    const anyStart = fc.record({
      mid: fc.record({ x: anyPx, y: anyPx }),
      halfSpread: fc.double({ min: 10, max: 400, noNaN: true }),
      angle: fc.double({ min: 0, max: Math.PI, noNaN: true }),
    });
    const anyChange = fc.record({
      spread: fc.double({ min: 0.2, max: 5, noNaN: true }),
      turn: fc.double({ min: -1, max: 1, noNaN: true }),
      move: fc.record({
        x: fc.double({ min: -300, max: 300, noNaN: true }),
        y: fc.double({ min: -300, max: 300, noNaN: true }),
      }),
    });

    fc.assert(
      fc.property(anyStart, anyChange, ({ mid, halfSpread, angle }, { spread, turn, move }) => {
        // Arrange
        const start = fingers(mid, halfSpread, angle);
        const moved = { x: mid.x + move.x, y: mid.y + move.y };
        const now = fingers(moved, halfSpread * spread, angle + turn);

        // Act
        const out = pinchOf(start, now);

        // Assert
        expect(out.factor).toBeCloseTo(1 / spread, 9);
        expect([out.anchor.x, out.anchor.y]).toEqual([
          expect.closeTo(mid.x, 9),
          expect.closeTo(mid.y, 9),
        ]);
        expect([out.to.x, out.to.y]).toEqual([
          expect.closeTo(moved.x, 9),
          expect.closeTo(moved.y, 9),
        ]);
      }),
    );
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
