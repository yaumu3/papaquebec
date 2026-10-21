import { describe, expect, it } from 'bun:test';

import { LAPSE_SEC } from '../../lib/reports';
import type { ReadingKey } from '../../state/plotted';
import { makeSample as sample } from '../../state/sampleFixture';
import type { Sample } from '../../state/track';
import { heardNearAt } from './heard';

describe('heardNearAt', () => {
  const T = 100;
  const FRESH = T - 1;
  const STALE = T - LAPSE_SEC - 1;

  it('clears what a lane reads of a sample heard a lapse ago, the track and heading each on its own', () => {
    // Arrange
    const rows: [ReadingKey[], Sample][] = [
      [
        ['trk', 'selHdg'],
        sample(T, {
          track: 90,
          heading: 91,
          selHeading: 270,
          heard: { track: STALE, heading: FRESH, selHeading: STALE },
        }),
      ],
      [['trk'], sample(T, { track: 90, heading: 91, heard: { track: FRESH } })],
      [['alt'], sample(T, { alt: 11000, heard: { alt: STALE } })],
      [
        ['wind'],
        sample(T, { windDir: 270, windSpeed: 20, heard: { windDir: FRESH, windSpeed: STALE } }),
      ],
      [['rssi'], sample(T, { rssi: -20, heard: {} })],
    ];

    // Act
    const out = rows.map(([keys, s]) => {
      const r = heardNearAt(keys, s);
      return [r.track, r.heading, r.selHeading, r.alt, r.windDir, r.windSpeed, r.rssi];
    });

    // Assert
    expect(out).toEqual([
      [undefined, 91, undefined, undefined, undefined, undefined, undefined],
      [90, undefined, undefined, undefined, undefined, undefined, undefined],
      [undefined, undefined, undefined, undefined, undefined, undefined, undefined],
      [undefined, undefined, undefined, undefined, undefined, undefined, undefined],
      [undefined, undefined, undefined, undefined, undefined, undefined, -20],
    ]);
  });
});
