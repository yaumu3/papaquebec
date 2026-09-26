import { describe, expect, it } from 'bun:test';

import {
  type Altimeter,
  displayAltitude,
  displayLevel,
  formatAltitude,
  holdsSelected,
  qnhAltitudeFt,
  type Selection,
  STANDARD_ALTIMETER,
} from './altitude';

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

describe('displayLevel', () => {
  it('is the hundreds of feet the block prints, passing ground and unknown through', () => {
    // Arrange
    const altimeter = { transitionAltFt: 14000, qnhInHg: 29.62 };
    const cases: (number | 'ground' | undefined)[] = [5000, 33000, 'ground', undefined];

    // Act
    const out = cases.map((alt) => displayLevel(alt, altimeter));

    // Assert
    expect(out).toEqual([47, 330, 'ground', undefined]);
  });
});

describe('holdsSelected', () => {
  it('holds within 200 ft of the selected altitude, read on the crew altimeter', () => {
    // Arrange
    const standard = { transitionAltFt: 14000, qnhInHg: 29.92 };
    const low = { transitionAltFt: 14000, qnhInHg: 29.62 };
    const cases: [Selection, Altimeter][] = [
      [{ alt: 35150, selAlt: 35000, navQnh: 1013.2 }, standard],
      [{ alt: 34700, selAlt: 35000, navQnh: 1013.2 }, standard],
      [{ alt: 4750, selAlt: 5000, navQnh: 1023.2 }, standard], // reads 5022 on the crew's 1023
      [{ alt: 4750, selAlt: 5000, navQnh: undefined }, standard], // reads 4750 on the operator's
      [{ alt: 35000, selAlt: 35000, navQnh: undefined }, low], // flight levels stay on standard
      [{ alt: 35000, selAlt: undefined, navQnh: 1013.2 }, standard],
      [{ alt: 'ground', selAlt: 0, navQnh: 1013.2 }, standard],
      [{ alt: undefined, selAlt: 5000, navQnh: undefined }, standard],
    ];

    // Act
    const out = cases.map(([selection, altimeter]) => holdsSelected(selection, altimeter));

    // Assert
    expect(out).toEqual([true, false, true, false, true, false, false, false]);
  });
});
