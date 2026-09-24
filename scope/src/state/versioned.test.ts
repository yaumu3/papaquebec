import { describe, expect, it } from 'bun:test';

import { versioned } from './versioned';

describe('versioned', () => {
  it('computes once however often it is read', () => {
    // Arrange
    let runs = 0;
    const value = versioned(() => ++runs);

    // Act
    const reads = [value.get(), value.get()];

    // Assert
    expect(reads).toEqual([1, 1]);
    expect(runs).toBe(1);
  });

  it('recomputes once after an invalidation', () => {
    // Arrange
    let runs = 0;
    const value = versioned(() => ++runs);
    value.get();
    value.invalidate();

    // Act
    const reads = [value.get(), value.get()];

    // Assert
    expect(reads).toEqual([2, 2]);
    expect(runs).toBe(2);
  });
});
