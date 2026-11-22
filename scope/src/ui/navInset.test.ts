import { describe, expect, it } from 'bun:test';

import { navInset } from './navInset';

describe('navInset', () => {
  it('takes the bar and the space under it, and nothing while the bar is not laid out', () => {
    // Arrange
    const rows: [number, { top: number; height: number }, number][] = [
      [844, { top: 770, height: 62 }, 74],
      [844, { top: 748, height: 62 }, 96],
      [844, { top: 0, height: 0 }, 0],
      [600, { top: 770, height: 62 }, 0],
    ];

    // Act
    const insets = rows.map(([viewport, bar]) => navInset(viewport, bar));

    // Assert
    expect(insets).toEqual(rows.map(([, , inset]) => inset));
  });
});
