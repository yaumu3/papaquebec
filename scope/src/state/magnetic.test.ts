import { afterEach, describe, expect, it } from 'bun:test';

import { magneticBearing, magneticTrack, setDeclinationAt } from './magnetic';
import { setSite } from './scope';

/** The model made simple: 8° west up to 135°E, 7° west beyond. */
const stepped = (_lat: number, lon: number) => (lon < 135 ? -8 : -7);

afterEach(() => {
  setDeclinationAt(() => () => 0);
  setSite(null);
});

describe('magneticTrack', () => {
  it('reads the true track against the declination where the target is, west adding', () => {
    // Arrange
    setDeclinationAt(() => stepped);
    const cases = [
      { track: 355, at: { lat: 34, lon: 130 } },
      { track: 90, at: { lat: 34, lon: 140 } },
      { track: undefined, at: { lat: 34, lon: 140 } },
    ];

    // Act
    const out = cases.map(magneticTrack);

    // Assert
    expect(out).toEqual([3, 97, undefined]);
  });

  it('reads a target without a position against the declination at the site', () => {
    // Arrange
    setDeclinationAt(() => stepped);
    setSite({ lat: 35, lon: 140 });

    // Act
    const out = magneticTrack({ track: 10, at: undefined });

    // Assert
    expect(out).toBe(17);
  });

  it('reads true bearings before the model is loaded and without a site', () => {
    // Arrange
    const cases = [
      { track: 10, at: undefined },
      { track: 10, at: { lat: 34, lon: 130 } },
    ];

    // Act
    const out = cases.map(magneticTrack);

    // Assert
    expect(out).toEqual([10, 10]);
  });
});

describe('magneticBearing', () => {
  it('reads a true bearing against the declination at a point, and at the site for none', () => {
    // Arrange
    setDeclinationAt(() => stepped);
    setSite({ lat: 35, lon: 140 });
    const points = [{ lat: 34, lon: 130 }, { lat: 34, lon: 140 }, undefined];

    // Act
    const out = points.map((at) => magneticBearing(10, at));

    // Assert
    expect(out).toEqual([18, 17, 17]);
  });
});
