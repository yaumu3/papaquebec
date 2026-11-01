import { describe, expect, it } from 'bun:test';

import { PASSES } from './renderer';

describe('PASSES', () => {
  it('draws a text batch halo before its glyphs, and the others in one pass', () => {
    // Arrange
    const kinds = ['lines', 'markers', 'text'] as const;

    // Act
    const passes = kinds.map((kind) => PASSES[kind]);

    // Assert
    expect(passes).toEqual([['lines'], ['markers'], ['halo', 'text']]);
  });
});
