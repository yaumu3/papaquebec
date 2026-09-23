import { describe, expect, it } from 'bun:test';

import { edt, INF } from './edt';

describe('edt', () => {
  it('computes squared Euclidean distance to the nearest zero cell', () => {
    // Arrange
    const w = 5;
    const h = 3;
    const grid = new Float64Array(w * h).fill(INF);
    grid[w + 2] = 0; // center of the middle row

    // Act
    edt(grid, w, h);

    // Assert
    expect(grid[w + 2]).toBe(0);
    expect(grid[w + 3]).toBe(1);
    expect(grid[2]).toBe(1);
    expect(grid[0]).toBe(5);
    expect(grid[2 * w + 4]).toBe(5);
  });

  it('leaves an all-zero grid at zero', () => {
    // Arrange
    const grid = new Float64Array(6);

    // Act
    edt(grid, 3, 2);

    // Assert
    expect([...grid]).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
