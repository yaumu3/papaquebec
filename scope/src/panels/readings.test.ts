import { describe, expect, it } from 'bun:test';

import { makeSample } from '../state/sampleFixture';
import { NONE, READINGS } from './readings';

describe('READINGS', () => {
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
