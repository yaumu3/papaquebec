import { describe, expect, it } from 'bun:test';

import { type Batch, transferables } from './protocol';

describe('transferables', () => {
  it('lists the buffer behind each batch once, so a layer moves to the worker uncopied', () => {
    // Arrange
    const own = new Float32Array(16);
    const shared = new Float32Array(32);
    const batches: Batch[] = [
      { kind: 'lines', data: own, count: 1 },
      { kind: 'markers', data: shared.subarray(0, 12), count: 1 },
      { kind: 'text', data: shared.subarray(16), count: 1 },
    ];

    // Act
    const transfer = transferables(batches);

    // Assert
    expect(transfer).toEqual([own.buffer, shared.buffer]);
  });
});
