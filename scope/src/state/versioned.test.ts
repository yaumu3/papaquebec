import { describe, expect, it } from 'bun:test';

import { versioned } from './versioned';

describe('versioned', () => {
  it('computes once per invalidation, however often it is read', () => {
    // Arrange
    let runs = 0;
    const value = versioned(() => ++runs);

    // Act
    const reads = [value.get(), value.get(), (value.invalidate(), value.get()), value.get()];

    // Assert
    expect(reads).toEqual([1, 1, 2, 2]);
    expect(runs).toBe(2);
  });
});
