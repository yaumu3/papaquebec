import { describe, expect, it } from 'bun:test';

import {
  climbArrow,
  climbState,
  emergencyCode,
  formatAge,
  formatAgo,
  formatBoundM,
  formatDistance,
  formatGsWake,
  formatMmSs,
  formatMach,
  clockTime,
  formatModes,
  formatRoll,
  modeNames,
  padBearing,
  sourceName,
  statusTags,
  type StatusTags,
  wakeLetter,
} from './format';

describe('climbState / climbArrow', () => {
  it('classifies vertical rate with a ±320 fpm dead band', () => {
    // Arrange
    const cases: [number | undefined, string, string][] = [
      [1500, 'climbing', '↑'],
      [-1200, 'descending', '↓'],
      [384, 'climbing', '↑'],
      [-384, 'descending', '↓'],
      [320, 'level', ' '],
      [-320, 'level', ' '],
      [undefined, 'level', ' '],
    ];

    // Act
    const results = cases.map(([r]) => [climbState(r), climbArrow(r)]);

    // Assert
    results.forEach((r, i) => {
      expect(r[0]).toBe(cases[i]?.[1]);
      expect(r[1]).toBe(cases[i]?.[2]);
    });
  });
});

describe('wakeLetter / formatGsWake', () => {
  it('maps ADS-B emitter category to a wake letter and tens of knots', () => {
    // Arrange
    const cases: [number | undefined, string | undefined, string, string][] = [
      [290, 'A3', 'M', '29M'],
      [95, 'A1', 'L', '10L'],
      [380, 'A5', 'H', '38H'],
      [250, 'A6', 'M', '25M'],
      [60, 'B1', 'L', '06L'],
      [40, 'B4', 'L', '04L'],
      [300, 'A0', '-', '30-'],
      [120, 'A7', '-', '12-'],
      [30, 'B2', '-', '03-'],
      [80, 'B6', '-', '08-'],
      [undefined, 'A3', 'M', '---'],
    ];

    // Act
    const results = cases.map(([gs, cat]) => [wakeLetter(cat), formatGsWake(gs, cat)]);

    // Assert
    results.forEach((r, i) => {
      expect(r[0]).toBe(cases[i]?.[2]);
      expect(r[1]).toBe(cases[i]?.[3]);
    });
  });
});

describe('emergencyCode', () => {
  it('takes the code first, then an emergency status, and never a priority', () => {
    // Arrange
    const cases: [string | undefined, string | undefined, 'HJ' | 'RF' | 'EM' | null][] = [
      ['7500', undefined, 'HJ'],
      ['7600', undefined, 'RF'],
      ['7700', undefined, 'EM'],
      ['7500', 'general', 'HJ'],
      ['7600', 'unlawful', 'RF'],
      ['7700', 'nordo', 'EM'],
      ['7700', 'minfuel', 'EM'],
      ['1200', 'general', 'EM'],
      ['1200', 'nordo', 'RF'],
      ['1200', 'unlawful', 'HJ'],
      ['1200', 'downed', 'EM'],
      ['1200', 'lifeguard', null],
      ['1200', 'minfuel', null],
      ['1200', 'none', null],
      ['1200', 'reserved', null],
      [undefined, 'nordo', 'RF'],
      ['constructor', 'toString', null],
      [undefined, undefined, null],
    ];

    // Act
    const results = cases.map(([sq, em]) => emergencyCode(sq, em));

    // Assert
    expect(results).toEqual(cases.map((c) => c[2]));
  });
});

describe('statusTags', () => {
  it('tags the code, the emergency it leaves unsaid, and the priority', () => {
    // Arrange
    const none = { code: null, status: null, priority: null };
    const cases: [string | undefined, string | undefined, StatusTags][] = [
      ['2253', undefined, none],
      ['2253', 'none', none],
      ['2253', 'reserved', none],
      ['2253', 'general', { ...none, status: 'EM' }],
      ['2253', 'nordo', { ...none, status: 'RF' }],
      ['2253', 'unlawful', { ...none, status: 'HJ' }],
      ['2253', 'downed', { ...none, status: 'DOWNED' }],
      ['2253', 'lifeguard', { ...none, priority: 'lifeguard' }],
      ['2253', 'minfuel', { ...none, priority: 'minfuel' }],
      [undefined, 'general', { ...none, status: 'EM' }],
      ['7700', undefined, { ...none, code: 'EM' }],
      ['7700', 'general', { ...none, code: 'EM' }],
      ['7700', 'unlawful', { ...none, code: 'EM', status: 'HJ' }],
      ['7700', 'downed', { ...none, code: 'EM', status: 'DOWNED' }],
      ['7700', 'minfuel', { ...none, code: 'EM', priority: 'minfuel' }],
      ['7600', 'nordo', { ...none, code: 'RF' }],
      ['7600', 'general', { ...none, code: 'RF', status: 'EM' }],
      ['7600', 'lifeguard', { ...none, code: 'RF', priority: 'lifeguard' }],
      ['7500', 'unlawful', { ...none, code: 'HJ' }],
      ['7500', 'nordo', { ...none, code: 'HJ', status: 'RF' }],
      ['7500', 'none', { ...none, code: 'HJ' }],
      ['constructor', 'toString', none],
    ];

    // Act
    const results = cases.map(([sq, em]) => statusTags(sq, em));

    // Assert
    expect(results).toEqual(cases.map((c) => c[2]));
  });
});

describe('formatMmSs / padBearing', () => {
  it('formats seconds as m:ss and bearings as three digits with north as 360', () => {
    // Arrange
    const secs = [0, 65, 3599, 3600, -1, Number.POSITIVE_INFINITY];
    const bearings = [0, 0.4, 5.4, 359.4, 359.6, 360, 720];

    // Act
    const t = secs.map(formatMmSs);
    const b = bearings.map(padBearing);

    // Assert
    expect(t).toEqual(['0:00', '1:05', '59:59', '>1h', '--:--', '--:--']);
    expect(b).toEqual(['360', '360', '005', '359', '360', '360', '360']);
  });
});

describe('formatMach', () => {
  it('renders Mach to two decimals with the M prefix', () => {
    // Arrange
    const values = [0.428, 0.85, 1.02, undefined];

    // Act
    const out = values.map(formatMach);

    // Assert
    expect(out).toEqual(['M0.43', 'M0.85', 'M1.02', '---']);
  });
});

describe('formatModes', () => {
  it('abbreviates the engaged modes in the order given and drops an empty list', () => {
    // Arrange
    const cases = [
      ['autopilot', 'vnav', 'althold', 'approach', 'lnav', 'tcas'],
      ['autopilot', 'glideslope'],
      [],
      undefined,
    ];

    // Act
    const out = cases.map(formatModes);

    // Assert
    expect(out).toEqual(['AP VNAV ALT APP LNAV TCAS', 'AP GLIDESLOPE', undefined, undefined]);
  });
});

describe('modeNames', () => {
  it('abbreviates each engaged mode as the panel shows it', () => {
    // Arrange
    const modes = ['autopilot', 'althold', 'glideslope'];

    // Act
    const names = modeNames(modes);

    // Assert
    expect(names).toEqual(['AP', 'ALT', 'GLIDESLOPE']);
  });
});

describe('clockTime', () => {
  it('reads hours, minutes and seconds of the UTC clock from seconds since the epoch', () => {
    // Arrange
    const t = 12 * 3600 + 36 * 60 + 10;

    // Act
    const label = clockTime(t);

    // Assert
    expect(label).toBe('12:36:10');
  });
});

describe('sourceName', () => {
  it('prints a source as the panels name it', () => {
    // Arrange
    const sources = ['adsb', 'mlat', 'tisb'] as const;

    // Act
    const names = sources.map(sourceName);

    // Assert
    expect(names).toEqual(['ADSB', 'MLAT', 'TISB']);
  });
});

describe('formatAge', () => {
  it('counts tenths of a second up to ten, whole seconds from there, and dashes the unknown', () => {
    // Arrange
    const ages = [0, 1.04, 9.94, 9.96, 12.3, 45.6, undefined];

    // Act
    const out = ages.map(formatAge);

    // Assert
    expect(out).toEqual(['0.0', '1.0', '9.9', '10', '12', '46', '---']);
  });
});

describe('formatDistance', () => {
  it('counts tenths of a mile up to a hundred, whole miles from there, and dashes the unknown', () => {
    // Arrange
    const miles = [0.44, 14.5, 99.94, 99.96, 123.4, undefined];

    // Act
    const out = miles.map(formatDistance);

    // Assert
    expect(out).toEqual(['0.4', '14.5', '99.9', '100', '123', '---']);
  });
});

describe('formatBoundM', () => {
  it('reads every radius of containment the tracker sends', () => {
    // Arrange
    const radii = [8, 25, 75, 186, 371, 556, 926, 1112, 1852, 3704, 7408, 14816, 18520, 37040];

    // Act
    const out = radii.map(formatBoundM);

    // Assert
    expect(out).toEqual([
      { v: '<8', unit: 'm' },
      { v: '<25', unit: 'm' },
      { v: '<75', unit: 'm' },
      { v: '<0.1', unit: 'NM' },
      { v: '<0.2', unit: 'NM' },
      { v: '<0.3', unit: 'NM' },
      { v: '<0.5', unit: 'NM' },
      { v: '<0.6', unit: 'NM' },
      { v: '<1', unit: 'NM' },
      { v: '<2', unit: 'NM' },
      { v: '<4', unit: 'NM' },
      { v: '<8', unit: 'NM' },
      { v: '<10', unit: 'NM' },
      { v: '<20', unit: 'NM' },
    ]);
  });

  it('reads every position error bound of the NACp categories', () => {
    // Arrange
    const bounds = [3, 10, 30, 92.6, 185.2, 555.6, 926, 1852, 3704, 7408, 18520];

    // Act
    const out = bounds.map(formatBoundM);

    // Assert
    expect(out).toEqual([
      { v: '<3', unit: 'm' },
      { v: '<10', unit: 'm' },
      { v: '<30', unit: 'm' },
      { v: '<93', unit: 'm' },
      { v: '<0.1', unit: 'NM' },
      { v: '<0.3', unit: 'NM' },
      { v: '<0.5', unit: 'NM' },
      { v: '<1', unit: 'NM' },
      { v: '<2', unit: 'NM' },
      { v: '<4', unit: 'NM' },
      { v: '<10', unit: 'NM' },
    ]);
  });

  it('rounds a bound between the steps of the miles up to the next', () => {
    // Arrange
    const bounds = [200, 1500, 1800, 2700];

    // Act
    const out = bounds.map(formatBoundM);

    // Assert
    expect(out).toEqual([
      { v: '<0.2', unit: 'NM' },
      { v: '<0.9', unit: 'NM' },
      { v: '<1', unit: 'NM' },
      { v: '<2', unit: 'NM' },
    ]);
  });

  it('reads a bound in miles from a tenth of a mile, in metres below', () => {
    // Arrange
    const bounds = [185.1, 185.2];

    // Act
    const out = bounds.map(formatBoundM);

    // Assert
    expect(out).toEqual([
      { v: '<186', unit: 'm' },
      { v: '<0.1', unit: 'NM' },
    ]);
  });
});

describe('formatRoll', () => {
  it('reads a bank to the whole degree with its side, and level without one', () => {
    // Arrange
    const banks = [15, -5, 0, 0.4, -0.4, -0, 14.6, -9.67, 35];

    // Act
    const out = banks.map(formatRoll);

    // Assert
    expect(out).toEqual(['R15°', 'L5°', '0°', '0°', '0°', '0°', 'R15°', 'L10°', 'R35°']);
  });
});

describe('formatAgo', () => {
  it('reads seconds before now as a true minus and mm:ss, minutes not wrapping into hours', () => {
    // Arrange
    const secs = [0, 59.6, 200, 3600, 3725, -5];

    // Act
    const labels = secs.map(formatAgo);

    // Assert
    expect(labels).toEqual(['−00:00', '−01:00', '−03:20', '−60:00', '−62:05', '−00:00']);
  });

  it('starts with U+2212, not a hyphen', () => {
    // Arrange
    const sec = 200;

    // Act
    const code = formatAgo(sec).codePointAt(0);

    // Assert
    expect(code).toBe(0x2212);
  });
});
