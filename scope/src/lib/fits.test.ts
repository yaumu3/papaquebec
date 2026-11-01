import { describe, expect, it } from 'bun:test';

import { fits, rememberFits, type ShownMemory } from './fits';

const T = 100;

describe('fits', () => {
  it('shows from 1.1 T, hides below T, and keeps the last state between', () => {
    // Arrange
    const rows: [number, boolean | undefined, boolean][] = [
      [100, undefined, true],
      [99, undefined, false],
      [105, true, true],
      [105, false, false],
      [110, false, true],
      [99, true, false],
    ];

    // Act
    const shown = rows.map(([room, was]) => fits(room, T, was));

    // Assert
    expect(shown).toEqual(rows.map(([, , expected]) => expected));
  });
});

describe('rememberFits', () => {
  it('writes what it decided under the key', () => {
    // Arrange
    const memory: ShownMemory = new Map([['A', true]]);

    // Act
    const shown = rememberFits(memory, 'A', 99, T);

    // Assert
    expect(shown).toBe(false);
    expect(memory.get('A')).toBe(false);
  });

  it('reads the last state of the key', () => {
    // Arrange
    const memory: ShownMemory = new Map([['A', false]]);

    // Act
    const shown = rememberFits(memory, 'A', 105, T);

    // Assert
    expect(shown).toBe(false);
  });
});
