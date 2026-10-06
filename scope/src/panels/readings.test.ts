import { describe, expect, it } from 'bun:test';

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
  it('names a live fix, owns up to one no longer live, and dashes none', () => {
    // Arrange
    const live = { kind: 'live', lat: 35.73266, lon: 139.99644, x: 1, y: 2 } as const;
    const last = { ...live, kind: 'last' } as const;

    // Act
    const readings = [
      positionReading(live),
      positionReading(last),
      positionReading({ kind: 'none' }),
    ];

    // Assert
    expect(readings).toEqual([
      { k: 'POSITION', r: { v: '35.73266 139.99644' } },
      { k: 'LAST POSITION', r: { v: '35.73266 139.99644' } },
      { k: 'POSITION', r: NONE },
    ]);
  });
});
