import { describe, expect, it } from 'bun:test';

import {
  formatListCount,
  climbArrow,
  climbState,
  emergencyCode,
  formatGsWake,
  formatMmSs,
  formatMach,
  formatModes,
  formatWind,
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
  it('derives the two-letter prefix from squawk or readsb emergency status', () => {
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

describe('formatWind', () => {
  it('renders wind as direction over speed', () => {
    // Arrange
    const winds: [number | undefined, number | undefined][] = [
      [255, 14],
      [0, 3],
      [undefined, 5],
      [180, undefined],
    ];

    // Act
    const w = winds.map(([dir, speed]) => formatWind(dir, speed));

    // Assert
    expect(w).toEqual(['255° / 14', '360° / 3', '---', '---']);
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
  it('abbreviates the engaged modes in readsb order and drops an empty list', () => {
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

describe('formatListCount', () => {
  it('names the hidden traffic only while the filter is cutting some', () => {
    // Arrange
    const cases: [number, number][] = [
      [9, 9],
      [6, 9],
      [0, 0],
    ];

    // Act
    const out = cases.map(([shown, total]) => formatListCount(shown, total));

    // Assert
    expect(out).toEqual(['9', '6 · 3 hidden', '0']);
  });
});
