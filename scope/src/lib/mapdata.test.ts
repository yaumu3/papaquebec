import { describe, expect, it } from 'bun:test';

import {
  EMPTY_AERO,
  mergeAero,
  parseAero,
  parseCoast,
  UNTITLED_AERO,
  validateAero,
} from './mapdata';

describe('parseCoast', () => {
  it('keeps well-formed lines and drops the rest', () => {
    // Arrange
    const raw = {
      lines: [
        [
          [130, 33],
          [131, 34],
        ],
        [['x', 1]],
        'junk',
      ],
    };

    // Act
    const coast = parseCoast(raw);

    // Assert
    expect(coast.lines).toEqual([
      [
        [130, 33],
        [131, 34],
      ],
    ]);
  });
});

describe('parseAero', () => {
  it('drops malformed entries per list and fills missing lists', () => {
    // Arrange
    const raw = {
      waypoints: [{ id: 'ORAMO', lat: 33.8, lon: 130.7 }, { id: 'BAD' }], // north-east of RJFF
      airspace: [{ name: 'TMA', center: [33.6, 130.5], radiusNm: 10, dashed: true }], // RJFF
    };

    // Act
    const aero = parseAero(raw);

    // Assert
    expect(aero.waypoints).toEqual([{ id: 'ORAMO', lat: 33.8, lon: 130.7 }]);
    expect(aero.airspace[0]?.dashed).toBe(true);
    expect(aero.airways).toEqual([]);
    expect(aero.navaids).toEqual([]);
  });

  it('accepts polygon airspace with limits, and airports', () => {
    // Arrange
    const raw = {
      airspace: [
        {
          name: 'CTR',
          kind: 'CTR',
          points: [
            [35.9, 140.2], // around RJAA
            [35.9, 140.6],
            [35.6, 140.6],
          ],
          lowerFt: 0,
          upperFt: 3000,
        },
        { name: 'bad', kind: 'CTR', points: 'x' },
      ],
      airports: [{ id: 'RJAA', name: 'NARITA INTL', lat: 35.765, lon: 140.386 }, { id: 'X' }],
    };

    // Act
    const aero = parseAero(raw);

    // Assert
    expect(aero.airspace).toEqual([
      {
        name: 'CTR',
        kind: 'CTR',
        points: [
          [35.9, 140.2], // around RJAA
          [35.9, 140.6],
          [35.6, 140.6],
        ],
        lowerFt: 0,
        upperFt: 3000,
      },
    ]);
    expect(aero.airports).toEqual([{ id: 'RJAA', name: 'NARITA INTL', lat: 35.765, lon: 140.386 }]);
  });
});

describe('parseAero title', () => {
  it('keeps the title and note only, and names an untitled file after itself', () => {
    // Arrange
    const titled = {
      title: 'openAIP JP 2026-09-24',
      note: 'CC BY-NC-SA 4.0',
      fetched: '2026-09-24',
    };
    const untitled = { title: 7 };

    // Act
    const out = [parseAero(titled), parseAero(untitled)];

    // Assert
    expect(out[0]?.title).toBe('openAIP JP 2026-09-24');
    expect(out[0]?.note).toBe('CC BY-NC-SA 4.0');
    expect(out[0]).not.toHaveProperty('fetched');
    expect(out[1]?.title).toBe(UNTITLED_AERO);
    expect(out[1]).not.toHaveProperty('note');
  });
});

describe('validateAero', () => {
  it('accepts a titled file, filling missing lists and dropping unknown keys', () => {
    // Arrange
    const raw = {
      $schema: './aero.schema.json',
      title: 'My fixes',
      waypoints: [{ id: 'ORAMO', lat: 33.8, lon: 130.7 }], // north-east of RJFF
    };

    // Act
    const out = validateAero(raw);

    // Assert
    expect(out).toEqual({
      ok: true,
      data: {
        ...EMPTY_AERO,
        title: 'My fixes',
        waypoints: [{ id: 'ORAMO', lat: 33.8, lon: 130.7 }],
      },
    });
  });

  it('rejects a malformed file with the offending paths', () => {
    // Arrange
    const raw = {
      waypoints: [
        { id: 'ORAMO', lat: 33.8, lon: 130.7 },
        { id: 'BAD', lat: 'x', lon: 130 },
      ],
    };

    // Act
    const out = validateAero(raw);

    // Assert
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.message).toContain('title');
    expect(out.message).toContain('waypoints[1].lat');
  });

  it('rejects anything that is not an object', () => {
    // Arrange
    const raw = [1, 2, 3];

    // Act
    const out = validateAero(raw);

    // Assert
    expect(out.ok).toBe(false);
  });
});

describe('mergeAero', () => {
  it('concatenates every list in set order', () => {
    // Arrange
    const a = { ...EMPTY_AERO, waypoints: [{ id: 'ORAMO', lat: 33.8, lon: 130.7 }] }; // north-east of RJFF
    const b = {
      ...EMPTY_AERO,
      waypoints: [{ id: 'CHIBA', lat: 35.6, lon: 140.1 }], // Chiba
      airports: [{ id: 'RJAA', name: 'NARITA INTL', lat: 35.765, lon: 140.386 }],
    };

    // Act
    const merged = mergeAero([a, b]);

    // Assert
    expect(merged.waypoints.map((w) => w.id)).toEqual(['ORAMO', 'CHIBA']);
    expect(merged.airports.map((p) => p.id)).toEqual(['RJAA']);
    expect(merged.airways).toEqual([]);
  });
});
