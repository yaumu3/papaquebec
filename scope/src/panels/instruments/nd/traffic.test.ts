import { describe, expect, it } from 'bun:test';

import { INSTRUMENT_SEC } from '../../../lib/reports';
import { makeTrack } from '../../../render/scene/trackFixture';
import { relativeAltitudeLabel, verticalArrow } from './traffic';

const NOW = 1000;
const FRESH = NOW - 1;

describe('relativeAltitudeLabel', () => {
  it('reads hundreds of feet with the sign of the rounded value, two digits at least', () => {
    // Arrange
    const rows = [0, -40, -900, 2700, 1100, 3100, -10500, 50, -50, 49, -49, -51];

    // Act
    const labels = rows.map(relativeAltitudeLabel);

    // Assert
    expect(labels).toEqual([
      '+00',
      '+00',
      '-09',
      '+27',
      '+11',
      '+31',
      '-105',
      '+01',
      '-01',
      '+00',
      '+00',
      '-01',
    ]);
  });
});

describe('verticalArrow', () => {
  it('shows an arrow from 500 fpm either way while the rate holds', () => {
    // Arrange
    const held = { verticalRate: FRESH };
    const rows = [
      makeTrack({ verticalRate: 499, heard: held }),
      makeTrack({ verticalRate: 500, heard: held }),
      makeTrack({ verticalRate: -499, heard: held }),
      makeTrack({ verticalRate: -500, heard: held }),
      makeTrack({ verticalRate: 2000, heard: { verticalRate: NOW - INSTRUMENT_SEC } }),
      makeTrack({ verticalRate: undefined, heard: held }),
    ];

    // Act
    const arrows = rows.map((t) => verticalArrow(t, NOW));

    // Assert
    expect(arrows).toEqual([undefined, '↑', undefined, '↓', undefined, undefined]);
  });
});
