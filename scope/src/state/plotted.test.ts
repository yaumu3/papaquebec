import { describe, expect, it } from 'bun:test';

import {
  closeLane,
  DEFAULT_PLOTTED,
  lanesOf,
  MAX_LANES,
  moveLane,
  type ReadingKey,
  readingsIn,
  togglePlotted,
} from './plotted';

describe('lanesOf', () => {
  it('names each lane once, in order of the first reading drawn in it', () => {
    // Arrange
    const plotted: ReadingKey[] = ['selAlt', 'gs', 'alt', 'fmsAlt', 'selHdg'];

    // Act
    const lanes = lanesOf(plotted);

    // Assert
    expect(lanes).toEqual(['alt', 'gs', 'trk']);
  });
});

describe('readingsIn', () => {
  it("lists a lane's own reading first, then the intents plotted in it, in their order", () => {
    // Arrange
    const plotted: ReadingKey[] = ['fmsAlt', 'gs', 'alt', 'selAlt'];

    // Act
    const keys = readingsIn(plotted, 'alt');

    // Assert
    expect(keys).toEqual(['alt', 'fmsAlt', 'selAlt']);
  });
});

describe('togglePlotted', () => {
  it('plots a reading that is off at the end', () => {
    // Arrange
    const plotted: ReadingKey[] = ['alt'];

    // Act
    const next = togglePlotted(plotted, 'vs');

    // Assert
    expect(next).toEqual(['alt', 'vs']);
  });

  it('removes a reading that is on', () => {
    // Arrange
    const plotted: ReadingKey[] = ['alt', 'gs'];

    // Act
    const next = togglePlotted(plotted, 'gs');

    // Assert
    expect(next).toEqual(['alt']);
  });

  it('takes the readings drawn in a lane away with the lane', () => {
    // Arrange
    const plotted: ReadingKey[] = ['alt', 'selAlt', 'gs', 'fmsAlt'];

    // Act
    const next = togglePlotted(plotted, 'alt');

    // Assert
    expect(next).toEqual(['gs']);
  });

  it('opens the lane an intent reading is drawn in when it is not open', () => {
    // Arrange
    const plotted: ReadingKey[] = ['alt'];

    // Act
    const next = togglePlotted(plotted, 'selHdg');

    // Assert
    expect(next).toEqual(['alt', 'trk', 'selHdg']);
  });

  it('refuses a reading that would open a lane past the limit, not one drawn in an open lane', () => {
    // Arrange
    const full: ReadingKey[] = ['alt', 'gs', 'trk', 'ias'];
    expect(full).toHaveLength(MAX_LANES);

    // Act
    const next = [togglePlotted(full, 'vs'), togglePlotted(full, 'selAlt')];

    // Assert
    expect(next).toEqual([full, ['alt', 'gs', 'trk', 'ias', 'selAlt']]);
  });
});

describe('closeLane', () => {
  it('removes the lane and every reading drawn in it', () => {
    // Arrange
    const plotted: ReadingKey[] = ['alt', 'selAlt', 'fmsAlt', 'gs'];

    // Act
    const next = closeLane(plotted, 'alt');

    // Assert
    expect(next).toEqual(['gs']);
  });
});

describe('moveLane', () => {
  it('moves a lane with the readings drawn in it, the rest keeping their order', () => {
    // Arrange
    const plotted: ReadingKey[] = ['alt', 'selAlt', 'gs', 'trk', 'selHdg'];

    // Act
    const next = moveLane(plotted, 0, 2);

    // Assert
    expect(next).toEqual(['gs', 'trk', 'selHdg', 'alt', 'selAlt']);
  });

  it('leaves the order alone when the lane goes where it is', () => {
    // Arrange
    const plotted: ReadingKey[] = ['alt', 'gs'];

    // Act
    const next = moveLane(plotted, 1, 1);

    // Assert
    expect(next).toEqual(['alt', 'gs']);
  });
});

describe('DEFAULT_PLOTTED', () => {
  it('plots altitude with both intents and ground speed on first use', () => {
    // Arrange
    const expected: ReadingKey[] = ['alt', 'selAlt', 'fmsAlt', 'gs'];

    // Act
    const plotted = [...DEFAULT_PLOTTED];

    // Assert
    expect(plotted).toEqual(expected);
  });
});
