import { describe, expect, it } from 'bun:test';

import { encodeIco } from './ico';

describe('encodeIco', () => {
  it('lays out a directory of PNG entries followed by their bytes', () => {
    // Arrange
    const small = { size: 16, png: new Uint8Array([1, 2, 3]) };
    const large = { size: 32, png: new Uint8Array([4, 5, 6, 7, 8]) };

    // Act
    const ico = encodeIco([small, large]);
    const view = new DataView(ico.buffer, ico.byteOffset, ico.byteLength);

    // Assert
    expect(ico.byteLength).toBe(6 + 2 * 16 + 3 + 5);
    expect([view.getUint16(0, true), view.getUint16(2, true), view.getUint16(4, true)]).toEqual([
      0, 1, 2,
    ]);
    expect([...ico.subarray(6, 10)]).toEqual([16, 16, 0, 0]);
    expect([view.getUint16(10, true), view.getUint16(12, true)]).toEqual([1, 32]);
    expect([view.getUint32(14, true), view.getUint32(18, true)]).toEqual([3, 38]);
    expect([...ico.subarray(22, 26)]).toEqual([32, 32, 0, 0]);
    expect([view.getUint32(30, true), view.getUint32(34, true)]).toEqual([5, 41]);
    expect([...ico.subarray(38)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('writes a 256 px entry with the zero that the format reserves for it', () => {
    // Arrange
    const entry = { size: 256, png: new Uint8Array([9]) };

    // Act
    const ico = encodeIco([entry]);

    // Assert
    expect([...ico.subarray(6, 8)]).toEqual([0, 0]);
  });
});
