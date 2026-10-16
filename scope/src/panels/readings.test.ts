import { describe, expect, it } from 'bun:test';

import { setDeclinationAt } from '../state/magnetic';
import { makeSample } from '../state/sampleFixture';
import { NONE, positionReading, READINGS } from './readings';

describe('READINGS', () => {
  it('reads the message rate to a tenth per second', () => {
    // Arrange
    const s = makeSample(1000, { messageRate: 1.26 });

    // Act
    const r = READINGS.msgs.format(s);

    // Assert
    expect(r).toEqual({ v: '1.3', unit: '/s' });
  });

  it('pairs the magnetic track with the heading as sent, each blank when unknown', () => {
    // Arrange
    setDeclinationAt(() => () => 7);
    const samples = [
      makeSample(1000, { track: 235, heading: 240, at: { lat: 33.6, lon: 130.5 } }),
      makeSample(1000, { heading: 240 }),
    ];

    // Act
    const readings = samples.map((s) => READINGS.trk.format(s));

    // Assert
    expect(readings).toEqual([{ v: '228° / 240°' }, { v: '--- / 240°' }]);
    setDeclinationAt(() => () => 0);
  });

  it('reads the selected heading only while it steers, as the lane and the data block do', () => {
    // Arrange
    const samples = [
      makeSample(1000, { selHeading: 270, navModes: ['autopilot'] }),
      makeSample(1000, { selHeading: 270, navModes: ['autopilot', 'lnav'] }),
    ];

    // Act
    const readings = samples.map((s) => READINGS.selHdg.format(s));

    // Assert
    expect(readings[0]).not.toEqual(NONE);
    expect(readings[1]).toEqual(NONE);
  });

  it('reads the wind as where from, then how fast', () => {
    // Arrange
    const s = makeSample(1000, { windDir: 269.4, windSpeed: 35.6 });

    // Act
    const r = READINGS.wind.format(s);

    // Assert
    expect(r).toEqual({ v: '269° / 36', unit: 'kt' });
  });

  it('reads the one reading of the unknown for whatever a sample lacks', () => {
    // Arrange
    const s = makeSample(1000);

    // Act
    const readings = (['alt', 'trk', 'mach', 'wind', 'modes', 'msgs'] as const).map((k) =>
      READINGS[k].format(s),
    );

    // Assert
    expect(readings).toEqual(readings.map(() => NONE));
  });
});

describe('positionReading', () => {
  it('names a live fix and dashes none', () => {
    // Arrange
    const live = { kind: 'live', lat: 35.73266, lon: 139.99644, x: 1, y: 2 } as const;

    // Act
    const readings = [positionReading(live), positionReading({ kind: 'none' })];

    // Assert
    expect(readings).toEqual([
      { k: 'POSITION', r: { v: '35.73266 139.99644' } },
      { k: 'POSITION', r: NONE },
    ]);
  });
});
