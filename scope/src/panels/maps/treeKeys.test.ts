import { describe, expect, it } from 'bun:test';

import { type TreeMove, treeMove } from './treeKeys';

describe('treeMove', () => {
  it('moves by the arrow keys, by whether the row is open, closed or opens nothing', () => {
    // Arrange
    const rows: [string, boolean | null, TreeMove | null][] = [
      ['ArrowDown', true, 'next'],
      ['ArrowDown', false, 'next'],
      ['ArrowDown', null, 'next'],
      ['ArrowUp', true, 'previous'],
      ['ArrowUp', false, 'previous'],
      ['ArrowUp', null, 'previous'],
      ['ArrowRight', false, 'toggle'],
      ['ArrowRight', true, 'next'],
      ['ArrowRight', null, null],
      ['ArrowLeft', true, 'toggle'],
      ['ArrowLeft', false, 'parent'],
      ['ArrowLeft', null, 'parent'],
      ['Enter', false, null],
      [' ', true, null],
      ['a', null, null],
    ];

    // Act
    const moves = rows.map(([key, expanded]) => treeMove(key, expanded));

    // Assert
    expect(moves).toEqual(rows.map(([, , expected]) => expected));
  });
});
