import { describe, expect, it } from 'bun:test';

import { loadDeclination, meshed } from './wmm';

describe('meshed', () => {
  it('answers from the centre of the cell, evaluating the model once per cell', () => {
    // Arrange: a model that records where it is asked
    const asked: [number, number][] = [];
    const declination = meshed((lat, lon) => {
      asked.push([lat, lon]);
      return lat + lon;
    }, 1);

    // Act
    const answers = [declination(35.2, 139.6), declination(35.4, 139.7), declination(36.1, 139.6)];

    // Assert
    expect(answers).toEqual([175, 175, 176]);
    expect(asked).toEqual([
      [35, 140],
      [36, 140],
    ]);
  });
});

describe('loadDeclination', () => {
  it('reads the model in the year of the clock', async () => {
    // Arrange: the start of 2025, the model's epoch; the value is one NOAA publishes with it
    const declination = await loadDeclination(Date.UTC(2025, 0, 1));

    // Act
    const d = declination(80, 0);

    // Assert
    expect(d).toBeCloseTo(1.28, 2);
  });
});
