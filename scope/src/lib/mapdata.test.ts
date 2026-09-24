import { describe, expect, it } from 'bun:test';

import { parseAero, parseCoast, UNTITLED_AERO } from './mapdata';

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

describe('parseAero fetched', () => {
  it('keeps the fetch date when it is a string and omits it otherwise', () => {
    // Arrange
    const dated = { fetched: '2026-09-22' };
    const undated = { fetched: 42 };

    // Act
    const out = [parseAero(dated), parseAero(undated)];

    // Assert
    expect(out[0]?.fetched).toBe('2026-09-22');
    expect(out[1]).not.toHaveProperty('fetched');
  });
});

describe('parseAero title', () => {
  it('keeps the title and note, and names an untitled file after itself', () => {
    // Arrange
    const titled = { title: 'openAIP JP', note: 'CC BY-NC-SA 4.0' };
    const untitled = { title: 7 };

    // Act
    const out = [parseAero(titled), parseAero(untitled)];

    // Assert
    expect(out[0]?.title).toBe('openAIP JP');
    expect(out[0]?.note).toBe('CC BY-NC-SA 4.0');
    expect(out[1]?.title).toBe(UNTITLED_AERO);
    expect(out[1]).not.toHaveProperty('note');
  });
});
