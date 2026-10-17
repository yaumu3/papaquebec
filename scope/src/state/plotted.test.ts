import { describe, expect, it } from 'bun:test';

import {
  canonical,
  DEFAULT_PLOTTED,
  INTENTS,
  LANE_GROUPS,
  LANE_KEYS,
  type LaneKey,
  MAX_LANES,
  moveLane,
  READING_KEYS,
  readingsIn,
  removeLane,
  togglePlotted,
} from './plotted';

describe('LANE_GROUPS', () => {
  it('lists the lanes by group, as the palette offers them', () => {
    // Arrange
    const expected = [
      { name: 'FLT', lanes: ['alt', 'vs', 'gs', 'trk', 'roll'] },
      { name: 'NAV', lanes: ['qnh', 'modes'] },
      { name: 'AIR', lanes: ['ias', 'tas', 'mach', 'wind', 'oat', 'tat'] },
      { name: 'POS', lanes: ['nic', 'nacp'] },
      { name: 'RX', lanes: ['src', 'rssi', 'msgs', 'age'] },
    ];

    // Act
    const groups: { name: string; lanes: string[] }[] = LANE_GROUPS.map((g) => ({
      name: g.name,
      lanes: [...g.lanes],
    }));

    // Assert
    expect(groups).toEqual(expected);
  });

  it('gives every reading one home: a lane of its own, or the one lane it is drawn in', () => {
    // Arrange
    const homes = [...LANE_KEYS, ...Object.values(INTENTS).flat()];

    // Act
    const counts = READING_KEYS.map((k) => homes.filter((home) => home === k).length);

    // Assert
    expect(counts).toEqual(READING_KEYS.map(() => 1));
  });
});

describe('readingsIn', () => {
  it("lists a lane's own reading first, then the intents always drawn in it", () => {
    // Arrange
    const lanes: LaneKey[] = ['alt', 'trk', 'gs'];

    // Act
    const keys = lanes.map(readingsIn);

    // Assert
    expect(keys).toEqual([['alt', 'selAlt', 'fmsAlt'], ['trk', 'selHdg'], ['gs']]);
  });
});

describe('togglePlotted', () => {
  it('plots a lane that is off at the end', () => {
    // Arrange
    const plotted: LaneKey[] = ['alt'];

    // Act
    const next = togglePlotted(plotted, 'vs');

    // Assert
    expect(next).toEqual(['alt', 'vs']);
  });

  it('removes a lane that is on', () => {
    // Arrange
    const plotted: LaneKey[] = ['alt', 'gs'];

    // Act
    const next = togglePlotted(plotted, 'alt');

    // Assert
    expect(next).toEqual(['gs']);
  });

  it('refuses a lane past the limit', () => {
    // Arrange
    const full: LaneKey[] = ['alt', 'gs', 'trk', 'ias'];
    // Precondition: the plot is full.
    expect(full).toHaveLength(MAX_LANES);

    // Act
    const next = togglePlotted(full, 'vs');

    // Assert
    expect(next).toEqual(full);
  });
});

describe('removeLane', () => {
  it('removes the lane, the rest keeping their order', () => {
    // Arrange
    const plotted: LaneKey[] = ['alt', 'gs', 'vs'];

    // Act
    const next = removeLane(plotted, 'gs');

    // Assert
    expect(next).toEqual(['alt', 'vs']);
  });
});

describe('moveLane', () => {
  it('moves a lane, the rest keeping their order', () => {
    // Arrange
    const plotted: LaneKey[] = ['alt', 'gs', 'trk'];

    // Act
    const next = moveLane(plotted, 0, 2);

    // Assert
    expect(next).toEqual(['gs', 'trk', 'alt']);
  });

  it('leaves the order alone when the lane goes where it is', () => {
    // Arrange
    const plotted: LaneKey[] = ['alt', 'gs'];

    // Act
    const next = moveLane(plotted, 1, 1);

    // Assert
    expect(next).toEqual(['alt', 'gs']);
  });
});

describe('canonical', () => {
  it('keeps the first lanes allowed, each once', () => {
    // Arrange
    const plotted: LaneKey[] = ['alt', 'gs', 'alt', 'trk', 'ias', 'vs'];

    // Act
    const kept = canonical(plotted);

    // Assert
    expect(kept).toEqual(['alt', 'gs', 'trk', 'ias']);
  });
});

describe('DEFAULT_PLOTTED', () => {
  it('plots altitude and ground speed on first use', () => {
    // Arrange
    const expected: LaneKey[] = ['alt', 'gs'];

    // Act
    const plotted = [...DEFAULT_PLOTTED];

    // Assert
    expect(plotted).toEqual(expected);
  });
});
