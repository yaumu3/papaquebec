import { describe, expect, it } from 'bun:test';

import { altitudeReadout, pfdGeometry, selDigits, type WheelCell } from './geometry';

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

describe('selDigits', () => {
  it('splits the selected altitude into thousands and three digits', () => {
    // Arrange
    const selected = [32000, 4500];

    // Act
    const out = selected.map(selDigits);

    // Assert
    expect(out).toEqual([
      { hi: '32', lo: '000' },
      { hi: '4', lo: '500' },
    ]);
  });
});

/** The middle of a wheel's row at rest, down the display. */
const restMiddle = (cell: WheelCell): number => cell.y + cell.restTop + cell.lineH / 2;

describe('altitudeReadout', () => {
  it('centres every digit at rest on the centre line, whatever its size', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const at = altitudeReadout(g);

    // Assert
    const wheels = [at.tenThousands, at.thousands, at.hundreds, at.drum];
    expect(wheels.map(restMiddle)).toEqual([g.yc, g.yc, g.yc, g.yc]);
  });
});
