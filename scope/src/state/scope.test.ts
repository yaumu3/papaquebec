import { beforeEach, describe, expect, it } from 'bun:test';

import { hovered, setHovered } from './scope';

describe('the hover', () => {
  beforeEach(() => {
    setHovered('scope', null);
    setHovered('list', null);
  });

  it('is replaced by a set from any surface', () => {
    // Arrange
    const sets = [
      ['list', 'd00001'],
      ['nd', 'd00002'],
      ['scope', 'd00003'],
    ] as const;

    // Act
    const seen = sets.map(([by, hex]) => {
      setHovered(by, hex);
      return hovered();
    });

    // Assert
    expect(seen).toEqual(['d00001', 'd00002', 'd00003']);
  });

  it('is cleared only by the surface that set it', () => {
    // Arrange
    setHovered('list', 'd00001');
    const clears = ['scope', 'nd', 'list'] as const;

    // Act
    const seen = clears.map((by) => {
      setHovered(by, null);
      return hovered();
    });

    // Assert
    expect(seen).toEqual(['d00001', 'd00001', null]);
  });
});
