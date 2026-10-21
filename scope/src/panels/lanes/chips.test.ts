import { describe, expect, it } from 'bun:test';

import type { LaneKey } from '../../state/plotted';
import { type Chip, chipName, chipOf, laneName, pickerName, pickOf } from './chips';

describe('chipOf', () => {
  it("tells the palette's own lane, a lane open elsewhere, and one free to pick", () => {
    // Arrange
    const plotted: LaneKey[] = ['alt', 'gs', 'pfd', 'nd'];
    const rows: [LaneKey | null, LaneKey][] = [
      ['alt', 'alt'],
      ['alt', 'gs'],
      ['alt', 'vs'],
      [null, 'alt'],
      [null, 'vs'],
      ['pfd', 'pfd'],
      [null, 'nd'],
    ];

    // Act
    const chips = rows.map(([own, lane]) => chipOf(plotted, own, lane));

    // Assert
    expect(chips).toEqual(['own', 'open', 'free', 'open', 'free', 'own', 'open']);
  });
});

describe('pickerName', () => {
  it("names a lane's palette after the lane, and the one with none for adding", () => {
    // Arrange
    const owners: (LaneKey | null)[] = ['alt', null];

    // Act
    const names = owners.map(pickerName);

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

describe('laneName', () => {
  it('names a history lane with its place, how to move it and the window keys', () => {
    // Arrange
    const rows: [LaneKey, number, number][] = [
      ['alt', 0, 4],
      ['gs', 2, 4],
    ];

    // Act
    const names = rows.map(([lane, index, count]) => laneName(lane, index, count));

    // Assert
    expect(names).toEqual([
      'ALT lane, 1 of 4. Drag it up or down, or press Alt and an arrow key, to move it; drag it sideways to select a span; Delete removes it; Shift+F10 opens its menu. The left and right arrows pan the window, the up and down arrows narrow and widen it, Home resets it.',
      'GS lane, 3 of 4. Drag it up or down, or press Alt and an arrow key, to move it; drag it sideways to select a span; Delete removes it; Shift+F10 opens its menu. The left and right arrows pan the window, the up and down arrows narrow and widen it, Home resets it.',
    ]);
  });

  it('names an instrument lane as it always was', () => {
    // Arrange
    const lane: LaneKey = 'pfd';

    // Act
    const name = laneName(lane, 0, 3);

    // Assert
    expect(name).toBe(
      'PFD lane, 1 of 3. Drag it, or press Alt and an arrow key, to move it; Delete removes it; Shift+F10 opens its menu.',
    );
  });
});

describe('pickOf', () => {
  it("switches the palette's lane to a free one, adds a free one to none, and goes to one that is open", () => {
    // Arrange
    const plotted: LaneKey[] = ['alt', 'gs', 'pfd'];
    const rows: [LaneKey | null, LaneKey][] = [
      ['alt', 'vs'],
      [null, 'vs'],
      ['alt', 'gs'],
      [null, 'pfd'],
      ['alt', 'alt'],
    ];

    // Act
    const picks = rows.map(([own, lane]) => pickOf(plotted, own, lane));

    // Assert
    expect(picks).toEqual(['switch', 'add', 'reveal', 'reveal', 'reveal']);
  });
});
