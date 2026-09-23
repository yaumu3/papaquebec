import { describe, expect, it } from 'bun:test';

import { displayAltitude, formatAltitude, qnhAltitudeFt, STANDARD_ALTIMETER } from './altitude';

describe('qnhAltitudeFt', () => {
  it('corrects pressure altitude by about 925 ft per inHg', () => {
    // Arrange
    const pressureAlt = 5000;

    // Act
    const low = qnhAltitudeFt(pressureAlt, 29.62);
    const std = qnhAltitudeFt(pressureAlt, 29.92);
    const high = qnhAltitudeFt(pressureAlt, 30.22);

    // Assert
    expect(std).toBe(5000);
    expect(low).toBeCloseTo(4723, 0);
    expect(high).toBeCloseTo(5277, 0);
  });
});

describe('displayAltitude', () => {
  const altimeter = { transitionAltFt: 14000, qnhInHg: 29.62 };

  it('uses QNH altitude below the transition altitude and flight level at or above it', () => {
    // Arrange
    const cases: (number | 'ground' | undefined)[] = [5000, 14200, 14400, 'ground', undefined];

    // Act
    const out = cases.map((alt) => displayAltitude(alt, altimeter));

    // Assert
    expect(out).toEqual([
      { kind: 'altitude', feet: 4723 },
      { kind: 'altitude', feet: 13923 },
      { kind: 'level', feet: 14400 },
      { kind: 'ground' },
      { kind: 'unknown' },
    ]);
  });

  it('is a plain flight level everywhere under the standard altimeter', () => {
    // Arrange
    const alt = 5000;

    // Act
    const out = displayAltitude(alt, { ...STANDARD_ALTIMETER, transitionAltFt: 0 });

    // Assert
    expect(out).toEqual({ kind: 'level', feet: 5000 });
  });
});

describe('formatAltitude', () => {
  it('renders three digits of hundreds of feet in either regime', () => {
    // Arrange
    const altimeter = { transitionAltFt: 14000, qnhInHg: 29.62 };
    const cases: (number | 'ground' | undefined)[] = [5000, 33000, 'ground', undefined];

    // Act
    const out = cases.map((alt) => formatAltitude(alt, altimeter));

    // Assert
    expect(out).toEqual(['047', '330', 'GND', '---']);
  });
});
