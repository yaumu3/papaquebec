import { describe, expect, it } from 'bun:test';

import {
  altitudeStripPath,
  fmaBandPath,
  fmaRulesPath,
  pfdGeometry,
  speedStripPath,
} from './geometry';

describe('pfdGeometry', () => {
  it('places the columns and rows from the width, and the height from the shared rule', () => {
    // Arrange
    const widths = [346, 400];

    // Act
    const out = widths.map(pfdGeometry);

    // Assert
    expect(out).toEqual([
      {
        w: 346,
        h: 230,
        sL: 8,
        sR: 54,
        wx: 68,
        wxr: 242,
        wy: 52,
        wyb: 194,
        acx: 155,
        yc: 123,
        yTop: 36,
        yBot: 210,
        aL: 258,
        aR: 316,
        vL: 322,
        rr: 59,
        selY: 24,
        footY: 220,
      },
      {
        w: 400,
        h: 266,
        sL: 8,
        sR: 54,
        wx: 68,
        wxr: 296,
        wy: 52,
        wyb: 230,
        acx: 182,
        yc: 141,
        yTop: 36,
        yBot: 246,
        aL: 312,
        aR: 370,
        vL: 376,
        rr: 77,
        selY: 24,
        footY: 256,
      },
    ]);
  });
});

describe('fmaRulesPath', () => {
  it('splits the band into three equal columns', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = fmaRulesPath(g);

    // Assert
    expect(out).toBe('M126.0 2.0V20.0M184.0 2.0V20.0');
  });
});

describe('fmaBandPath', () => {
  it('spans the attitude window from y 2 to 20', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = fmaBandPath(g);

    // Assert
    expect(out).toBe('M68.0 2.0H242.0V20.0H68.0Z');
  });
});

describe('speedStripPath', () => {
  it('frames the speed tape between its ends', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = speedStripPath(g);

    // Assert
    expect(out).toBe('M8.0 36.0H54.0V210.0H8.0Z');
  });
});

describe('altitudeStripPath', () => {
  it('frames the altitude tape between its ends', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = altitudeStripPath(g);

    // Assert
    expect(out).toBe('M258.0 36.0H316.0V210.0H258.0Z');
  });
});
