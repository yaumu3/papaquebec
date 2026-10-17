import { describe, expect, it } from 'bun:test';

import {
  addLane,
  DEFAULT_PLOTTED,
  INTENTS,
  LANE_GROUPS,
  laneAfter,
  LANE_KEYS,
  type LaneKey,
  moveLane,
  READING_KEYS,
  readingsIn,
  removeLane,
  switchLane,
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

describe('switchLane', () => {
  it('puts the lane picked in the place of the one switched, unless it is open or that is not', () => {
    // Arrange
    const plotted: LaneKey[] = ['alt', 'gs', 'vs'];
    const switches: [LaneKey, LaneKey][] = [
      ['gs', 'ias'],
      ['gs', 'vs'],
      ['trk', 'ias'],
    ];

    // Act
    const next = switches.map(([from, to]) => switchLane(plotted, from, to));

    // Assert
    expect(next).toEqual([
      ['alt', 'ias', 'vs'],
      ['alt', 'gs', 'vs'],
      ['alt', 'gs', 'vs'],
    ]);
  });
});

describe('addLane', () => {
  it('adds a lane at the end, unless it is open', () => {
    // Arrange
    const plotted: LaneKey[] = ['alt', 'gs'];
    const added: LaneKey[] = ['roll', 'alt'];

    // Act
    const next = added.map((lane) => addLane(plotted, lane));

    // Assert
    expect(next).toEqual([
      ['alt', 'gs', 'roll'],
      ['alt', 'gs'],
    ]);
  });
});

describe('laneAfter', () => {
  it('names the lane that follows, none after the last or for one not open', () => {
    // Arrange
    const plotted: LaneKey[] = ['alt', 'gs', 'vs'];
    const lanes: LaneKey[] = ['alt', 'gs', 'vs', 'trk'];

    // Act
    const after = lanes.map((lane) => laneAfter(plotted, lane));

    // Assert
    expect(after).toEqual(['gs', 'vs', null, null]);
  });
});
