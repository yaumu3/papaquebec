import { describe, expect, it } from 'bun:test';

import { createSimSource } from './source';

const site = { lat: 33.5844, lon: 130.4517 }; // RJFF

describe('createSimSource', () => {
  it('reports the configured site as the receiver', () => {
    // Arrange
    const source = createSimSource(site, () => 1000);

    // Act
    const rx = source.receiver();

    // Assert
    expect(rx).toEqual({ lat: 33.5844, lon: 130.4517, refresh: 1000 });
  });

  it('moves every aircraft along its track between polls', () => {
    // Arrange
    let t = 1000;
    const source = createSimSource(site, () => t);
    const first = source.poll();
    t += 10;

    // Act
    const second = source.poll();

    // Assert
    expect(second.now).toBe(1010);
    expect(second.messages).toBeGreaterThan(first.messages);
    second.aircraft.forEach((a, i) => {
      const before = first.aircraft[i];
      expect(a.hex).toBe(before?.hex ?? '');
      const moved = Math.hypot(
        (a.lat ?? 0) - (before?.lat ?? 0),
        (a.lon ?? 0) - (before?.lon ?? 0),
      );
      expect(moved).toBeGreaterThan(0);
    });
  });

  it('counts messages in proportion to elapsed sim time', () => {
    // Arrange
    let t = 1000;
    const source = createSimSource(site, () => t);
    const first = source.poll();
    t += 10;

    // Act
    const second = source.poll();

    // Assert
    expect(second.messages - first.messages).toBe(120);
  });

  it('includes one MLAT target and one emergency so every glyph and color is exercised', () => {
    // Arrange
    const source = createSimSource(site, () => 1000);

    // Act
    const snap = source.poll();

    // Assert
    expect(snap.aircraft.some((a) => a.mlat?.includes('lat'))).toBe(true);
    expect(snap.aircraft.some((a) => a.squawk === '7700')).toBe(true);
    expect(snap.aircraft.every((a) => a.seen !== undefined && a.seen_pos !== undefined)).toBe(true);
  });

  it('puts the emergency on a fictional target with no airline callsign', () => {
    // Arrange
    const source = createSimSource(site, () => 1000);

    // Act
    const snap = source.poll();

    // Assert
    const emergency = snap.aircraft.filter((a) => a.squawk === '7700');
    expect(emergency.length).toBe(1);
    expect(emergency[0]?.flight).toBeUndefined();
  });
});

describe('createSimSource ground traffic', () => {
  it('reports the taxiing targets on the ground, at taxi speed', () => {
    // Arrange
    const source = createSimSource(site, () => 1000);

    // Act
    const snap = source.poll();

    // Assert
    const ground = snap.aircraft.filter((a) => a.alt_baro === 'ground');
    expect(ground.length).toBeGreaterThanOrEqual(2);
    expect(ground.every((a) => (a.gs ?? 0) > 0 && (a.gs ?? 0) < 40)).toBe(true);
    expect(ground.every((a) => a.baro_rate === 0)).toBe(true);
  });
});

describe('createSimSource autopilot intent', () => {
  it('pauses on a newly set level before starting toward it', () => {
    // Arrange
    let t = 1000;
    const source = createSimSource(site, () => t);
    source.poll();
    t += 30;

    // Act
    const snap = source.poll();

    // Assert
    const nca125 = snap.aircraft.find((a) => a.flight?.trim() === 'NCA125');
    expect([nca125?.alt_baro, nca125?.nav_altitude_mcp, nca125?.baro_rate]).toEqual([
      17000, 21000, 1000,
    ]);
  });

  it('sets the level it came from once it has held the selected one', () => {
    // Arrange
    let t = 1000;
    const source = createSimSource(site, () => t);
    source.poll();
    t += 200;
    source.poll();
    t += 100;

    // Act
    const snap = source.poll();

    // Assert
    const jal318 = snap.aircraft.find((a) => a.flight?.trim() === 'JAL318');
    expect([jal318?.alt_baro, jal318?.nav_altitude_mcp, jal318?.baro_rate]).toEqual([
      7000, 5000, 0,
    ]);
  });
});
