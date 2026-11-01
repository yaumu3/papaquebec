import { describe, expect, it } from 'bun:test';

import { inboundTrack } from './racetrack';

const never = () => {
  throw new Error('the declination was read');
};

describe('inboundTrack', () => {
  it('takes inboundTrue without reading the declination', () => {
    // Arrange
    const hold = { inboundTrue: 198, inboundMag: 205 };

    // Act
    const track = inboundTrack(hold, never);

    // Assert
    expect(track).toBe(198);
  });

  it('takes inboundMag turned to true by the declination at the fix', () => {
    // Arrange
    const hold = { inboundMag: 25 };

    // Act
    const track = inboundTrack(hold, () => -7);

    // Assert
    expect(track).toBeCloseTo(18);
  });
});
