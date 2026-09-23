import { describe, expect, it } from 'bun:test';

import { webgpuMissingReason } from './availability';

describe('webgpuMissingReason', () => {
  it('blames the insecure origin before the browser, and is silent when WebGPU exists', () => {
    // Arrange
    const cases: [boolean, boolean][] = [
      [true, true],
      [false, false],
      [false, true],
    ];

    // Act
    const out = cases.map(([hasGpu, secure]) => webgpuMissingReason(hasGpu, secure));

    // Assert
    expect(out).toEqual([
      null,
      'WebGPU needs a secure context: open the scope over https or via localhost',
      'WebGPU is not available in this browser',
    ]);
  });
});
