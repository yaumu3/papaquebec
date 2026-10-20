import { describe, expect, it } from 'bun:test';

import { setDeclinationAt } from '../state/magnetic';
import { isInstrumentLane, LANE_KEYS } from '../state/plotted';
import { makeSample } from '../state/sampleFixture';
import { LANE_LABELS, NONE, positionReading, READINGS } from './readings';

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

  it('reads the bank with its side, blank when unknown', () => {
    // Arrange
    const samples = [
      makeSample(1000, { roll: 15.2 }),
      makeSample(1000, { roll: -4.9 }),
      makeSample(1000),
    ];

    // Act
    const readings = samples.map((s) => READINGS.roll.format(s));

    // Assert
    expect(readings).toEqual([{ v: 'R15°' }, { v: 'L5°' }, NONE]);
  });

  it('reads the NIC as its radius of containment, and blank for NIC 0 or without a position', () => {
    // Arrange
    const samples = [
      makeSample(1000, { nic: 8, rc: 186 }),
      makeSample(1000, { nic: 0 }),
      makeSample(1000),
    ];

    // Act
    const readings = samples.map((s) => READINGS.nic.format(s));

    // Assert
    expect(readings).toEqual([{ v: '<0.1', unit: 'NM' }, NONE, NONE]);
  });

  it('reads the category of a NIC that stands for no radius', () => {
    // Arrange
    const s = makeSample(1000, { nic: 6 });

    // Act
    const r = READINGS.nic.format(s);

    // Assert
    expect(r).toEqual({ v: '6' });
  });

  it('reads the NACp as its position error bound, a query for NACp 0 and blank without one', () => {
    // Arrange
    const samples = [
      makeSample(1000, { nacP: 9 }),
      makeSample(1000, { nacP: 0 }),
      makeSample(1000),
    ];

    // Act
    const readings = samples.map((s) => READINGS.nacp.format(s));

    // Assert
    expect(readings).toEqual([{ v: '<30', unit: 'm' }, { v: '?' }, NONE]);
  });

  it('prints a sign only on a temperature that rounds away from zero', () => {
    // Arrange
    const samples = [0.3, -0.3, 0.6, -2.4].map((oat) => makeSample(1000, { oat }));

    // Act
    const readings = samples.map((s) => READINGS.oat.format(s));

    // Assert
    expect(readings).toEqual([
      { v: '0', unit: '°C' },
      { v: '0', unit: '°C' },
      { v: '+1', unit: '°C' },
      { v: '-2', unit: '°C' },
    ]);
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

describe('READINGS values', () => {
  it('reads a number of a reading as the reading itself reads', () => {
    // Arrange
    const rows = [
      { key: 'alt', v: 34_000 },
      { key: 'alt', v: 8000 },
      { key: 'vs', v: 2000 },
      { key: 'gs', v: 465 },
      { key: 'qnh', v: 29.85 },
      { key: 'mach', v: 0.8 },
      { key: 'nic', v: 1852 },
      { key: 'nacp', v: 20 },
    ] as const;

    // Act
    const readings = rows.map(({ key, v }) => READINGS[key].value?.(v));

    // Assert
    expect(readings.map((r) => [r?.v, r?.unit])).toEqual([
      ['FL340', undefined],
      ['8000', 'ft'],
      ['+2000', 'fpm'],
      ['465', 'kt'],
      ['29.85', 'inHg'],
      ['M0.80', undefined],
      ['<1', 'NM'],
      ['<20', 'm'],
    ]);
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

describe('LANE_LABELS', () => {
  it('labels a lane of a reading as the reading is labeled, and each instrument by its name', () => {
    // Arrange
    const lanes = LANE_KEYS.filter((lane) => !isInstrumentLane(lane));

    // Act
    const labels = [
      ...lanes.map((lane) => LANE_LABELS[lane]),
      LANE_LABELS.pfd,
      LANE_LABELS.nd,
      LANE_LABELS.surv,
    ];

    // Assert
    expect(labels).toEqual([...lanes.map((lane) => READINGS[lane].label), 'PFD', 'ND', 'SURV']);
  });
});
