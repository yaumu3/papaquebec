import { describe, expect, it } from 'bun:test';

import {
  climbArrow,
  climbState,
  emergencyCode,
  formatAge,
  formatDistance,
  formatGsWake,
  formatMmSs,
  formatMach,
  formatModes,
  padBearing,
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
  it('derives the two-letter prefix from the squawk or the emergency status', () => {
    // Arrange
    const cases: [string | undefined, string | undefined, 'HJ' | 'RF' | 'EM' | null][] = [
      ['7500', undefined, 'HJ'],
      ['7600', undefined, 'RF'],
      ['7700', undefined, 'EM'],
      ['1200', 'general', 'EM'],
      ['1200', 'none', null],
      ['1200', 'reserved', null],
      [undefined, undefined, null],
    ];

    // Act
    const results = cases.map(([sq, em]) => emergencyCode(sq, em));

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
