import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import { onCircle } from '../lib/math';
import { wrapIndex } from './wrap';

describe('wrapIndex', () => {
  it('steps to the next or the previous of a ring, round either end', () => {
    // Arrange: a ring of some size and a place on it
    const anyPlace = fc
      .integer({ min: 1, max: 50 })
      .chain((count) => fc.record({ count: fc.constant(count), i: fc.nat({ max: count - 1 }) }));

    fc.assert(
      fc.property(anyPlace, ({ count, i }) => {
        // Act
        const [next, previous] = [false, true].map((back) => wrapIndex(i, count, back));

        // Assert
        expect(next).toBe(onCircle(i + 1, count));
        expect(previous).toBe(onCircle(i - 1, count));
      }),
    );
  });

  it('steps in from outside a ring to its first or its last', () => {
    // Arrange
    const anyCount = fc.integer({ min: 1, max: 50 });
    const anyOutside = fc.integer({ min: -50, max: -1 });

    fc.assert(
      fc.property(anyCount, anyOutside, (count, i) => {
        // Act
        const [next, previous] = [false, true].map((back) => wrapIndex(i, count, back));

        // Assert
        expect(next).toBe(0);
        expect(previous).toBe(count - 1);
      }),
    );
  });
});
