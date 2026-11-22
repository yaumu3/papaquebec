import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import { edt, INF } from './edt';

/** The transform of a grid `width` wide with a feature wherever `features` says so, row by row. */
function transformed(features: readonly boolean[], width: number): number[] {
  const grid = Float64Array.from(features, (feature) => (feature ? 0 : INF));
  edt(grid, width, features.length / width);
  return Array.from(grid);
}

describe('edt', () => {
  it('computes squared Euclidean distance to the nearest zero cell', () => {
    // Arrange: a grid of any shape with at least one feature cell
    const anyGrid = fc
      .tuple(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 12 }))
      .chain(([width, height]) =>
        fc.record({
          width: fc.constant(width),
          features: fc.array(fc.boolean(), {
            minLength: width * height,
            maxLength: width * height,
          }),
        }),
      )
      .filter(({ features }) => features.includes(true));

    fc.assert(
      fc.property(anyGrid, ({ width, features }) => {
        // Act
        const distances = transformed(features, width);

        // Assert
        const cells = features.map((feature, i) => ({
          feature,
          x: i % width,
          y: Math.floor(i / width),
        }));
        const nearest = cells.map((cell) =>
          Math.min(
            ...cells
              .filter((other) => other.feature)
              .map((other) => (other.x - cell.x) ** 2 + (other.y - cell.y) ** 2),
          ),
        );
        expect(distances).toEqual(nearest);
      }),
    );
  });
});
