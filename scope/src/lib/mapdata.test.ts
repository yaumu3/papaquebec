import { describe, expect, it } from 'bun:test';

import { parseCoast } from './mapdata';

describe('parseCoast', () => {
  it('keeps well-formed lines and drops the rest', () => {
    // Arrange
    const raw = {
      lines: [
        [
          [130, 33],
          [131, 34],
        ],
        [['x', 1]],
        'junk',
      ],
    };

    // Act
    const coast = parseCoast(raw);

    // Assert
    expect(coast.lines).toEqual([
      [
        [130, 33],
        [131, 34],
      ],
    ]);
  });
});
