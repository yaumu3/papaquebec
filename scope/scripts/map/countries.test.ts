import { describe, expect, it } from 'bun:test';

import { countriesNear } from './countries';

describe('countriesNear', () => {
  it('lists the countries with a polygon box within the radius of the site, sorted', () => {
    // Arrange
    const table = {
      JP: [
        [129.41, 31.03, 145.54, 45.55], // main islands
        [122.93, 24.04, 125.47, 25.95], // Sakishima
      ],
      KR: [[126.12, 34.39, 129.47, 38.61]],
      RU: [[-180, 41.15, 180, 81.25]],
      US: [[-125, 25, -66.96, 49.5]],
    } as const;

    // Act
    const narita = countriesNear({ lat: 35.765, lon: 140.386 }, 150, table); // RJAA
    const okinawa = countriesNear({ lat: 26.2, lon: 127.65 }, 150, table); // ROAH

    // Assert
    expect(narita).toEqual(['JP']);
    expect(okinawa).toEqual(['JP']);
  });

  it('reaches a neighbor once the radius crosses into its box', () => {
    // Arrange
    const table = { JP: [[129.41, 31.03, 145.54, 45.55]], KR: [[126.12, 34.39, 129.47, 38.61]] };

    // Act
    const out = countriesNear({ lat: 33.6, lon: 130.45 }, 100, table); // RJFF

    // Assert
    expect(out).toEqual(['JP', 'KR']);
  });
});
