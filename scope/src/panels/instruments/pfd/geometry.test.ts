import { describe, expect, it } from 'bun:test';

import {
  altitudeStripPath,
  apY,
  attitude,
  bankIndexPath,
  bankScalePath,
  fmaBandPath,
  fmaColumnX,
  fmaRulesPath,
  pfdGeometry,
  speedBoxPath,
  speedDigits,
  speedReadout,
  speedStripPath,
  speedTape,
  tapeY,
  windowRect,
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

describe('fmaColumnX', () => {
  it('centres each column of the band', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = fmaColumnX(g);

    // Assert
    expect(out).toEqual([97, 155, 213]);
  });
});

describe('apY', () => {
  it('stands just above the attitude window', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = apY(g);

    // Assert
    expect(out).toBe(42);
  });
});

describe('tapeY', () => {
  it('puts the value at the centre line, and the ends of the span at the ends of the tape', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = [tapeY(g, 262, 262, 45), tapeY(g, 307, 262, 45), tapeY(g, 217, 262, 45)];

    // Assert
    expect(out).toEqual([g.yc, g.yTop, g.yBot]);
  });
});

describe('speedTape', () => {
  it('ticks every 10 kt short of the tape ends and labels every 20 kt clear of the readout', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = speedTape(g, 262);

    // Assert
    expect(out.ticks).toBe(
      'M54.0 204.2h-8M54.0 184.9h-8M54.0 165.5h-8M54.0 146.2h-8M54.0 126.9h-8' +
        'M54.0 107.5h-8M54.0 88.2h-8M54.0 68.9h-8M54.0 49.5h-8',
    );
    expect(out.labels).toEqual([
      { text: '220', x: 43, y: 204.2 },
      { text: '240', x: 43, y: 165.5 },
      { text: '280', x: 43, y: 88.2 },
      { text: '300', x: 43, y: 49.5 },
    ]);
  });

  it('draws nothing below 0 kt', () => {
    // Arrange
    const g = pfdGeometry(346);
    const speeds = [20, 0];

    // Act
    const out = speeds.map((ias) => speedTape(g, ias));

    // Assert
    expect(out.map((tape) => tape.ticks)).toEqual([
      'M54.0 161.7h-8M54.0 142.3h-8M54.0 123.0h-8M54.0 103.7h-8M54.0 84.3h-8M54.0 65.0h-8M54.0 45.7h-8',
      'M54.0 123.0h-8M54.0 103.7h-8M54.0 84.3h-8M54.0 65.0h-8M54.0 45.7h-8',
    ]);
    expect(out.map((tape) => tape.labels.map((l) => l.text))).toEqual([
      ['0', '40', '60'],
      ['20', '40'],
    ]);
  });
});

describe('speedBoxPath', () => {
  it('is a box with a spike to the right at the centre line', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = speedBoxPath(g);

    // Assert
    expect(out).toBe('M4.0 105.0H40.0V118.0L45.0 123.0L40.0 128.0V141.0H4.0Z');
  });
});

describe('speedDigits', () => {
  it('reads the tens, and the ones with the neighbours the drum shows', () => {
    // Arrange
    const speeds = [262, 279, 270];

    // Act
    const out = speeds.map(speedDigits);

    // Assert
    expect(out).toEqual([
      { hi: '26', drum: ['3', '2', '1'] },
      { hi: '27', drum: ['0', '9', '8'] },
      { hi: '27', drum: ['1', '0', '9'] },
    ]);
  });
});

describe('speedReadout', () => {
  it('anchors the tens and the clipped drum inside the box', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = speedReadout(g);

    // Assert
    expect(out).toEqual({ midX: 31, hiX: 28, drum: { x: 29, y: 106, w: 10, h: 34 }, drumTop: -10 });
  });
});

describe('attitude horizon', () => {
  it('passes through the centre, cutting the window at its edges for ±60° and 0° of roll', () => {
    // Arrange
    const g = pfdGeometry(346);
    const rolls = [60, -60, 0];

    // Act
    const out = rolls.map((roll) => attitude(g, roll).horizon);

    // Assert
    expect(out).toEqual([
      'M196.0 52.0L114.0 194.0',
      'M114.0 52.0L196.0 194.0',
      'M242.0 123.0L68.0 123.0',
    ]);
  });

  it('fills the sky above the horizon and the ground below it at level flight', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = attitude(g, 0);

    // Assert
    expect(out.sky).toBe('M68.0 52.0L242.0 52.0L242.0 123.0L68.0 123.0Z');
    expect(out.ground).toBe('M242.0 123.0L242.0 194.0L68.0 194.0L68.0 123.0Z');
  });
});

describe('attitude ladder', () => {
  it('drops the rungs that would leave the window, and numbers those at 10° at both ends', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = attitude(g, 0);

    // Assert
    expect((out.ladder.match(/M/g) ?? []).length).toBe(11);
    expect(out.labels.map((l) => l.text)).toEqual(['10', '10', '10', '10']);
  });
});

describe('attitude pointer', () => {
  it('is a triangle at the top of the scale for level flight', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = attitude(g, 0).pointer;

    // Assert
    expect(out).toBe('M155.0 66.0L150.9 76.2L159.1 76.2Z');
  });
});

describe('bankScalePath', () => {
  it('ticks ±10, 20, 30, 45 and 60°, longer at 30° and 60°', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = bankScalePath(g);

    // Assert
    expect((out.match(/M/g) ?? []).length).toBe(10);
    expect(out.startsWith('M103.9 93.5L94.4 88.0')).toBe(true);
  });
});

describe('bankIndexPath', () => {
  it('is a triangle at the top of the scale', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = bankIndexPath(g);

    // Assert
    expect(out).toBe('M155.0 64.0l-6 -9h12Z');
  });
});

describe('windowRect', () => {
  it('is the attitude window with its rounded corners', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = windowRect(g);

    // Assert
    expect(out).toEqual({ x: 68, y: 52, width: 174, height: 142, rx: 12 });
  });
});
