import { afterEach, describe, expect, it } from 'bun:test';

import { magneticTrack, setDeclination } from './magnetic';

afterEach(() => setDeclination(0));

describe('magneticTrack', () => {
  it('reads the true track against the site declination, west adding', () => {
    // Arrange
    setDeclination(-8);
    const cases = [{ track: 355 }, { track: 90 }, { track: undefined }];

    // Act
    const out = cases.map(magneticTrack);

    // Assert
    expect(out).toEqual([3, 98, undefined]);
  });
});
