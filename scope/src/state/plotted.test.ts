import { describe, expect, it } from 'bun:test';

import {
  addLane,
  DEFAULT_PLOTTED,
  INTENTS,
  LANE_GROUPS,
  type HistoryLane,
  historyLanesOf,
  isInstrumentLane,
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
      { name: 'INST', lanes: ['pfd', 'nd', 'surv'] },
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

describe('isInstrumentLane', () => {
  it('tells the lanes of an instrument from the lanes of a reading', () => {
    // Arrange
    const lanes: LaneKey[] = ['pfd', 'nd', 'surv', 'alt', 'age'];

    // Act
    const flags = lanes.map(isInstrumentLane);

    // Assert
    expect(flags).toEqual([true, true, true, false, false]);
  });
});

describe('historyLanesOf', () => {
  it('keeps the lanes of readings, in their order', () => {
    // Arrange
    const plotted: LaneKey[] = ['pfd', 'alt', 'nd', 'gs', 'surv'];

    // Act
    const lanes = historyLanesOf(plotted);

    // Assert
    expect(lanes).toEqual(['alt', 'gs']);
  });

  it('is empty for a column of instruments alone', () => {
    // Arrange
    const plotted: LaneKey[] = ['pfd', 'nd'];

    // Act
    const lanes = historyLanesOf(plotted);

    // Assert
    expect(lanes).toEqual([]);
  });
});

describe('readingsIn', () => {
  it("lists a lane's own reading first, then the intents always drawn in it", () => {
    // Arrange
    const lanes: HistoryLane[] = ['alt', 'trk', 'gs'];

    // Act
    const keys = lanes.map(readingsIn);

    // Assert
    expect(keys).toEqual([['alt', 'selAlt', 'fmsAlt'], ['trk', 'selHdg'], ['gs']]);
  });
});

describe('removeLane', () => {
  it('removes the lane, the rest keeping their order', () => {
    // Arrange
    const plotted: LaneKey[] = ['pfd', 'alt', 'gs', 'vs'];
    const removed: LaneKey[] = ['gs', 'pfd'];

    // Act
    const next = removed.map((lane) => removeLane(plotted, lane));

    // Assert
    expect(next).toEqual([
      ['pfd', 'alt', 'vs'],
      ['alt', 'gs', 'vs'],
    ]);
  });
});

describe('moveLane', () => {
  it('moves a lane, the rest keeping their order', () => {
    // Arrange
    const plotted: LaneKey[] = ['alt', 'nd', 'gs', 'trk'];
    const moves: [number, number][] = [
      [0, 2],
      [1, 3],
      [3, 1],
    ];

    // Act
    const next = moves.map(([from, to]) => moveLane(plotted, from, to));

    // Assert
    expect(next).toEqual([
      ['nd', 'gs', 'alt', 'trk'],
      ['alt', 'gs', 'trk', 'nd'],
      ['alt', 'trk', 'nd', 'gs'],
    ]);
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
    const plotted: LaneKey[] = ['alt', 'pfd', 'gs', 'vs'];
    const switches: [LaneKey, LaneKey][] = [
      ['gs', 'ias'],
      ['gs', 'vs'],
      ['trk', 'ias'],
      ['gs', 'nd'],
      ['gs', 'pfd'],
      ['pfd', 'surv'],
    ];

    // Act
    const next = switches.map(([from, to]) => switchLane(plotted, from, to));

    // Assert
    expect(next).toEqual([
      ['alt', 'pfd', 'ias', 'vs'],
      ['alt', 'pfd', 'gs', 'vs'],
      ['alt', 'pfd', 'gs', 'vs'],
      ['alt', 'pfd', 'nd', 'vs'],
      ['alt', 'pfd', 'gs', 'vs'],
      ['alt', 'surv', 'gs', 'vs'],
    ]);
  });
});

describe('addLane', () => {
  it('adds a lane at the end, unless it is open', () => {
    // Arrange
    const plotted: LaneKey[] = ['alt', 'pfd', 'gs'];
    const added: LaneKey[] = ['roll', 'alt', 'nd', 'pfd'];

    // Act
    const next = added.map((lane) => addLane(plotted, lane));

    // Assert
    expect(next).toEqual([
      ['alt', 'pfd', 'gs', 'roll'],
      ['alt', 'pfd', 'gs'],
      ['alt', 'pfd', 'gs', 'nd'],
      ['alt', 'pfd', 'gs'],
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
