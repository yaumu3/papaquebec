import { describe, expect, it } from 'bun:test';

import { nextSheet } from './layout';

describe('nextSheet', () => {
  it('opens the tapped panel, closes it when tapped again, and swaps between panels', () => {
    // Arrange
    const steps: [string | null, string][] = [
      [null, 'list'],
      ['list', 'list'],
      ['list', 'detail'],
    ];

    // Act
    const out = steps.map(([current, tapped]) => nextSheet(current, tapped));

    // Assert
    expect(out).toEqual(['list', null, 'detail']);
  });
});
