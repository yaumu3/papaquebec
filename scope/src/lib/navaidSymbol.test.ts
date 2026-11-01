import { describe, expect, it } from 'bun:test';

import { navaidSymbol } from './navaidSymbol';

const SIZE = 12;

describe('navaidSymbol', () => {
  it('draws one circle for an unknown kind, a missing one and another letter case', () => {
    // Arrange
    const kinds = ['LOC', undefined, 'vor', 'Vortac'];

    // Act
    const figures = kinds.map((kind) => navaidSymbol(kind, SIZE));

    // Assert
    expect(figures).toEqual(kinds.map(() => navaidSymbol('other', SIZE)));
    expect(navaidSymbol('VOR', SIZE)).not.toEqual(navaidSymbol('other', SIZE));
  });
});
