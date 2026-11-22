import { describe, expect, it } from 'bun:test';

import { INFO_PAGES } from '../state/settingsDefaults';
import { cycle } from './cycle';

describe('cycle', () => {
  it('goes on to the next step, wraps from the last, and starts over from one the list lacks', () => {
    // Arrange
    const rows: [readonly [unknown, ...unknown[]], unknown, unknown][] = [
      [INFO_PAGES, 'qnh', 'tracks'],
      [INFO_PAGES, 'tracks', 'rate'],
      [INFO_PAGES, 'rate', 'qnh'],
      [[0, 30, 60, 120], 60, 120],
      [[0, 30, 60, 120], 120, 0],
      [[0, 30, 60, 120], 45, 0],
    ];

    // Act
    const next = rows.map(([steps, current]) => cycle(steps, current));

    // Assert
    expect(next).toEqual(rows.map(([, , want]) => want));
  });
});
