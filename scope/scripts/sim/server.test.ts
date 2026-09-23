import { describe, expect, it } from 'bun:test';

import { simClock, simHandler } from './server';

const site = { lat: 33.5844, lon: 130.4517 }; // RJFF
const get = (path: string) => new Request(`http://sim${path}`);

describe('simHandler', () => {
  it('answers receiver.json with the site and a refresh matching the speed', async () => {
    // Arrange
    const handle = simHandler({ site, speed: 4 });

    // Act
    const res = await handle(get('/data/receiver.json')).json();

    // Assert
    expect(res).toEqual({ lat: 33.5844, lon: 130.4517, refresh: 250 });
  });

  it('answers aircraft.json with the fleet', async () => {
    // Arrange
    const handle = simHandler({ site, speed: 1 });

    // Act
    const res: unknown = await handle(get('/data/aircraft.json')).json();

    // Assert
    expect(res).toMatchObject({ aircraft: expect.any(Array) });
  });

  it('answers anything else with 404', () => {
    // Arrange
    const handle = simHandler({ site, speed: 1 });

    // Act
    const res = handle(get('/chunks/chunks.json'));

    // Assert
    expect(res.status).toBe(404);
  });
});

describe('simClock', () => {
  it('advances sim seconds at the given multiple of wall time', () => {
    // Arrange
    let wallMs = 10_000;
    const clock = simClock(10, () => wallMs);
    const start = clock();
    wallMs += 1500;

    // Act
    const later = clock();

    // Assert
    expect(later - start).toBeCloseTo(15);
  });
});
