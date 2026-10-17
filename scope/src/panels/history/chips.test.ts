import { describe, expect, it } from 'bun:test';

import type { LaneKey } from '../../state/plotted';
import { chipOf } from './chips';

describe('chipOf', () => {
  it("tells the palette's own lane, a lane open elsewhere, and one free to pick", () => {
    // Arrange
    const plotted: LaneKey[] = ['alt', 'gs'];
    const rows: [LaneKey | null, LaneKey][] = [
      ['alt', 'alt'],
      ['alt', 'gs'],
      ['alt', 'vs'],
      [null, 'alt'],
      [null, 'vs'],
    ];

    // Act
    const chips = rows.map(([own, lane]) => chipOf(plotted, own, lane));

    // Assert
    expect(chips).toEqual(['own', 'open', 'free', 'open', 'free']);
  });
});
