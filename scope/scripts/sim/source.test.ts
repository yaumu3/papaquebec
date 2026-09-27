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
    const test07 = snap.aircraft.find((a) => a.flight?.trim() === 'TEST07');
    expect([test07?.alt_baro, test07?.nav_altitude_mcp, test07?.baro_rate]).toEqual([
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
    const test03 = snap.aircraft.find((a) => a.flight?.trim() === 'TEST03');
    expect([test03?.alt_baro, test03?.nav_altitude_mcp, test03?.baro_rate]).toEqual([
      7000, 5000, 0,
    ]);
  });
});

describe('createSimSource extra traffic', () => {
  it('adds the requested number of aircraft, each with its own hex, within the bounds', () => {
    // Arrange
    const base = createSimSource(site, () => 1000).poll().aircraft.length;
    const source = createSimSource(site, () => 1000, 1000, 500);

    // Act
    const snap = source.poll();

    // Assert
    expect(snap.aircraft.length).toBe(base + 500);
    expect(new Set(snap.aircraft.map((a) => a.hex)).size).toBe(base + 500);
    expect(
      snap.aircraft.every(
        (a) => Math.abs((a.lat ?? 0) - site.lat) < 1 && Math.abs((a.lon ?? 0) - site.lon) < 1.2,
      ),
    ).toBe(true);
  });

  it('flies every aircraft under a fictional TEST callsign and registration', () => {
    // Arrange
    const source = createSimSource(site, () => 1000, 1000, 50);

    // Act
    const snap = source.poll();

    // Assert
    const callsigns = snap.aircraft.flatMap((a) => (a.flight ? [a.flight.trim()] : []));
    const regs = snap.aircraft.map((a) => a.r ?? '');
    expect(callsigns.length).toBeGreaterThan(50);
    expect(callsigns.filter((c) => !c.startsWith('TEST'))).toEqual([]);
    expect(regs.filter((r) => !r.startsWith('TEST-'))).toEqual([]);
  });

  it('addresses every aircraft from the block ICAO reserves for future use', () => {
    // Arrange
    const source = createSimSource(site, () => 1000, 1000, 50);

    // Act
    const snap = source.poll();

    // Assert
    const outside = snap.aircraft.map((a) => a.hex).filter((h) => !/^d[0-9a-f]{5}$/.test(h));
    expect(outside).toEqual([]);
  });

  it('places the extra aircraft the same way on every run', () => {
    // Arrange
    const first = createSimSource(site, () => 1000, 1000, 50).poll();

    // Act
    const second = createSimSource(site, () => 1000, 1000, 50).poll();

    // Assert
    expect(second.aircraft).toEqual(first.aircraft);
  });
});
