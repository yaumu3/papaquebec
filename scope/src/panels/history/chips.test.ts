import { describe, expect, it } from 'bun:test';

import type { LaneKey } from '../../state/plotted';
import { type Chip, chipName, chipOf, paletteName } from './chips';

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

describe('paletteName', () => {
  it("names a lane's palette after the lane, and the one with none for adding", () => {
    // Arrange
    const owners: (LaneKey | null)[] = ['alt', null];

    // Act
    const names = owners.map(paletteName);

    // Assert
    expect(names).toEqual(['ALT lane: pick a lane', 'Add a lane']);
  });
});

describe('chipName', () => {
  it('names a chip open elsewhere as such, and leaves the others to their text', () => {
    // Arrange
    const rows: [LaneKey, Chip][] = [
      ['gs', 'open'],
      ['alt', 'own'],
      ['vs', 'free'],
    ];

    // Act
    const names = rows.map(([lane, chip]) => chipName(lane, chip));

    // Assert
    expect(names).toEqual(['GS, already open', undefined, undefined]);
  });
});
