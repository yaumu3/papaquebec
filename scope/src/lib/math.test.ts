import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import { clamp, onCircle } from './math';

describe('clamp', () => {
  it('holds a value within its bounds, as it is when already within', () => {
    // Arrange
    const anyValue = fc.double({ noNaN: true });
    const anyBounds = fc
      .tuple(fc.double({ noNaN: true }), fc.double({ noNaN: true }))
      .map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as const);

    fc.assert(
      fc.property(anyValue, anyBounds, (v, [lo, hi]) => {
        // Act
        const held = clamp(v, lo, hi);

        // Assert: adding zero, as a zero of either sign is the same value
        expect(held).toBeGreaterThanOrEqual(lo);
        expect(held).toBeLessThanOrEqual(hi);
        expect(held + 0).toBe((v < lo ? lo : v > hi ? hi : v) + 0);
      }),
    );
  });
});

describe('onCircle', () => {
  it('wraps a value into 0 up to but not including the circle, whichever way round', () => {
    // Arrange: whole numbers, which wrap exactly
    const anyValue = fc.integer({ min: -1e9, max: 1e9 });
    const anyCircle = fc.integer({ min: 1, max: 100_000 });

    fc.assert(
      fc.property(anyValue, anyCircle, (v, wrap) => {
        // Act
        const wrapped = onCircle(v, wrap);

        // Assert
        expect(wrapped).toBeGreaterThanOrEqual(0);
        expect(wrapped).toBeLessThan(wrap);
        expect(Number.isInteger((v - wrapped) / wrap)).toBe(true);
      }),
    );
  });
});
