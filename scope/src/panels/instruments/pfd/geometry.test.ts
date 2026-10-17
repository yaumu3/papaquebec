import { describe, expect, it } from 'bun:test';

import {
  altitudeBoxPath,
  altitudeDigits,
  altitudeReadout,
  altitudeStripPath,
  altitudeTape,
  apY,
  attitude,
  bankIndexPath,
  bankScalePath,
  fpvAt,
  fmsLinePath,
  fpvPath,
  fmaBandPath,
  fmaColumnX,
  fmaRulesPath,
  pfdGeometry,
  selBugPath,
  selClipRect,
  selDigits,
  speedBoxPath,
  speedDigits,
  speedReadout,
  speedStripPath,
  speedTape,
  tapeY,
  type Wheel,
  type WheelCell,
  wheelTop,
  vsiDigits,
  vsiNeedlePath,
  vsiOffset,
  vsiScale,
  vsiStripPath,
  vsiY,
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

const cellNumbers = (c: WheelCell) => Object.values(c).map((v) => Number(v.toFixed(2)));

const roundedWheels = (ws: Wheel[]) =>
  ws.map((w) => ({ ...w, turned: Number(w.turned.toFixed(6)) }));

describe('speedDigits', () => {
  it('rolls the tens and hundreds through the last knot, the ones drum at its exact place', () => {
    // Arrange
    const speeds = [259, 260, 259.5, 299.5, 85, 0];

    // Act
    const out = speeds.map(speedDigits);

    // Assert
    expect(out.map((d) => roundedWheels([d.hundreds, d.tens, d.ones]))).toEqual([
      [
        { rows: ['3', '2'], turned: 0 },
        { rows: ['6', '5'], turned: 0 },
        { rows: ['1', '0', '9', '8'], turned: 0 },
      ],
      [
        { rows: ['3', '2'], turned: 0 },
        { rows: ['7', '6'], turned: 0 },
        { rows: ['2', '1', '0', '9'], turned: 0 },
      ],
      [
        { rows: ['3', '2'], turned: 0 },
        { rows: ['6', '5'], turned: 0.5 },
        { rows: ['1', '0', '9', '8'], turned: 0.5 },
      ],
      [
        { rows: ['3', '2'], turned: 0.5 },
        { rows: ['0', '9'], turned: 0.5 },
        { rows: ['1', '0', '9', '8'], turned: 0.5 },
      ],
      [
        { rows: ['1', ''], turned: 0 },
        { rows: ['9', '8'], turned: 0 },
        { rows: ['7', '6', '5', '4'], turned: 0 },
      ],
      [
        { rows: ['1', ''], turned: 0 },
        { rows: ['1', '0'], turned: 0 },
        { rows: ['2', '1', '0', ''], turned: 0 },
      ],
    ]);
  });
});

describe('speedReadout', () => {
  it('stands a window on each digit, the ones drum clipped inside the box', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = speedReadout(g);

    // Assert
    expect(out.midX).toBe(31);
    expect([out.hundreds, out.tens, out.ones].map(cellNumbers)).toEqual([
      [8.8, 115, 9.6, 16, 16, 1],
      [18.4, 115, 9.6, 16, 16, 1],
      [29, 106, 10, 34, 18, 2],
    ]);
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

describe('fpvAt', () => {
  it('stands at the window centre with no climb and no drift', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = fpvAt(g, 0, { fpaDeg: 0, driftDeg: 0 });

    // Assert
    expect(out).toEqual([155, 123]);
  });

  it('moves up the climb angle and along the drift at the ladder scale, rolled with the sky', () => {
    // Arrange
    const g = pfdGeometry(346);
    const cases = [0, 90];

    // Act
    const out = cases.map((roll) => fpvAt(g, roll, { fpaDeg: 5, driftDeg: 10 }).map(Math.round));

    // Assert
    expect(out).toEqual([
      [191, 105],
      [137, 87],
    ]);
  });

  it('stays whole inside the window at the right and at the bottom', () => {
    // Arrange
    const g = pfdGeometry(346);
    const cases = [
      { fpaDeg: 0, driftDeg: 40 },
      { fpaDeg: -30, driftDeg: 0 },
    ];

    // Act
    const out = cases.map((fpv) => fpvAt(g, 0, fpv));

    // Assert
    expect(out).toEqual([
      [224, 123],
      [155, 189],
    ]);
  });
});

describe('fpvPath', () => {
  it('draws a circle with two wings and a fin', () => {
    // Arrange
    const at: [number, number] = [155, 123];

    // Act
    const out = fpvPath(at);

    // Assert
    expect(out).toBe(
      'M150.0 123.0A5.0 5.0 0 1 0 160.0 123.0A5.0 5.0 0 1 0 150.0 123.0' +
        'M150.0 123.0h-13M160.0 123.0h13M155.0 118.0v-7',
    );
  });
});

describe('altitudeTape', () => {
  it('ticks every 100 ft short of the tape ends, long at the labels, and labels clear of the readout', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = altitudeTape(g, 37000);

    // Assert
    expect(out.ticks).toBe(
      'M258.0 200.3h9M258.0 181.0h5M258.0 161.7h9M258.0 142.3h5M258.0 123.0h9' +
        'M258.0 103.7h5M258.0 84.3h9M258.0 65.0h5M258.0 45.7h9',
    );
    expect(out.labels).toEqual([
      { hi: '36', lo: '600', x: 271, y: 200.3 },
      { hi: '36', lo: '800', x: 271, y: 161.7 },
      { hi: '37', lo: '200', x: 271, y: 84.3 },
      { hi: '37', lo: '400', x: 271, y: 45.7 },
    ]);
    expect(out.bars).toBe('');
  });

  it('bars a labelled thousand above and below', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = altitudeTape(g, 29600);

    // Assert
    expect(out.bars).toBe('M269.0 36.7H314.0M269.0 54.7H314.0');
  });

  it('leaves out a bar that falls off the tape', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = altitudeTape(g, 29575);

    // Assert
    expect(out.bars).toBe('M269.0 49.8H314.0');
  });

  it('signs the labels below zero', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = altitudeTape(g, 100);

    // Assert
    expect(out.labels.map((l) => [l.hi, l.lo])).toContainEqual(['−0', '200']);
  });
});

describe('altitudeBoxPath', () => {
  it('is a box with a spike to the left at the centre line', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = altitudeBoxPath(g);

    // Assert
    expect(out).toBe('M273.0 105.0H321.0V141.0H273.0V128.0L268.0 123.0L273.0 118.0Z');
  });
});

describe('altitudeDigits', () => {
  it('rolls each digit through the last 20 ft before it changes, the drum at its exact place', () => {
    // Arrange
    const altitudes = [29575, 29595, 29995, 29600, 30000, 9990, 8640, -40];

    // Act
    const out = altitudes.map(altitudeDigits);

    // Assert
    const wheels = out.map((d) => [d.tenThousands, d.thousands, d.hundreds, d.drum]);
    const rounded = wheels.map((row) =>
      row.map((w) => ({ ...w, turned: Number(w.turned.toFixed(6)) })),
    );
    expect(rounded).toEqual([
      [
        { rows: ['3', '2'], turned: 0 },
        { rows: ['0', '9'], turned: 0 },
        { rows: ['6', '5'], turned: 0 },
        { rows: ['00', '80', '60', '40'], turned: 0.75 },
      ],
      [
        { rows: ['3', '2'], turned: 0 },
        { rows: ['0', '9'], turned: 0 },
        { rows: ['6', '5'], turned: 0.75 },
        { rows: ['20', '00', '80', '60'], turned: 0.75 },
      ],
      [
        { rows: ['3', '2'], turned: 0.75 },
        { rows: ['0', '9'], turned: 0.75 },
        { rows: ['0', '9'], turned: 0.75 },
        { rows: ['20', '00', '80', '60'], turned: 0.75 },
      ],
      [
        { rows: ['3', '2'], turned: 0 },
        { rows: ['0', '9'], turned: 0 },
        { rows: ['7', '6'], turned: 0 },
        { rows: ['40', '20', '00', '80'], turned: 0 },
      ],
      [
        { rows: ['4', '3'], turned: 0 },
        { rows: ['1', '0'], turned: 0 },
        { rows: ['1', '0'], turned: 0 },
        { rows: ['40', '20', '00', '80'], turned: 0 },
      ],
      [
        { rows: ['1', ''], turned: 0.5 },
        { rows: ['0', '9'], turned: 0.5 },
        { rows: ['0', '9'], turned: 0.5 },
        { rows: ['20', '00', '80', '60'], turned: 0.5 },
      ],
      [
        { rows: ['1', ''], turned: 0 },
        { rows: ['9', '8'], turned: 0 },
        { rows: ['7', '6'], turned: 0 },
        { rows: ['80', '60', '40', '20'], turned: 0 },
      ],
      [
        { rows: ['1', '−'], turned: 0 },
        { rows: ['1', '0'], turned: 0 },
        { rows: ['1', '0'], turned: 0 },
        { rows: ['80', '60', '40', '20'], turned: 0 },
      ],
    ]);
  });
});

describe('altitudeDigits drum near zero', () => {
  it('reads the absolute value in the row below 00, which is 20 within 20 ft of zero', () => {
    // Arrange
    const altitudes = [0, 15, -10, 20, -40];

    // Act
    const out = altitudes.map((ft) => altitudeDigits(ft).drum);

    // Assert
    expect(roundedWheels(out)).toEqual([
      { rows: ['40', '20', '00', '20'], turned: 0 },
      { rows: ['40', '20', '00', '20'], turned: 0.75 },
      { rows: ['40', '20', '00', '20'], turned: 0.5 },
      { rows: ['60', '40', '20', '00'], turned: 0 },
      { rows: ['80', '60', '40', '20'], turned: 0 },
    ]);
  });
});

describe('wheelTop', () => {
  it('puts the resting row in the window and moves the column down by the turned part of a row', () => {
    // Arrange
    const cases: [number, number, number, number][] = [
      [34, 17, 2, 0],
      [34, 17, 2, 0.75],
      [17, 17, 1, 0],
      [17, 17, 1, 0.5],
    ];

    // Act
    const out = cases.map((c) => wheelTop(...c));

    // Assert
    expect(out).toEqual([-25.5, -12.75, -17, -8.5]);
  });
});

describe('altitudeReadout', () => {
  it('stands a window on each digit, right to left from the drum, on the line the text had', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = altitudeReadout(g);

    // Assert
    expect(out.tapeX).toBe(287);
    expect(out.midX).toBe(297);
    expect([out.hundreds, out.thousands, out.tenThousands, out.drum].map(cellNumbers)).toEqual([
      [293.2, 117.94, 7.8, 13, 13, 1],
      [283, 114.5, 10.2, 17, 17, 1],
      [272.8, 114.5, 10.2, 17, 17, 1],
      [303, 106, 17, 34, 17, 2],
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

describe('selBugPath', () => {
  it('straddles the tape edge, centred on the readout on capture', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = selBugPath(g, 29600, 29600);

    // Assert
    expect(out).toBe('M249.0 103.0H275.0V143.0H249.0V129.0L255.0 123.0L249.0 117.0Z');
  });

  it('parks at the end of the tape, its centre on that end, when off the scale', () => {
    // Arrange
    const g = pfdGeometry(346);
    const cases = [
      [29600, 32000],
      [18000, 14000],
    ] as const;

    // Act
    const out = cases.map(([ft, sel]) => selBugPath(g, ft, sel));

    // Assert
    expect(out).toEqual([
      'M249.0 16.0H275.0V56.0H249.0V42.0L255.0 36.0L249.0 30.0Z',
      'M249.0 190.0H275.0V230.0H249.0V216.0L255.0 210.0L249.0 204.0Z',
    ]);
  });
});

describe('selClipRect', () => {
  it('clips the bug to the tape rows, the bug itself standing beyond the edge', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = selClipRect(g);

    // Assert
    expect(out).toEqual({ x: 246, y: 36, width: 74, height: 174 });
  });
});

describe('fmsLinePath', () => {
  it('crosses the tape at the altitude when in view, and is none when out of it', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = [fmsLinePath(g, 29600, 29900), fmsLinePath(g, 29600, 32000)];

    // Assert
    expect(out).toEqual(['M258.0 65.0H316.0', undefined]);
  });
});

describe('vsiOffset', () => {
  it('follows the nonlinear scale at each breakpoint, capped at 6000 fpm', () => {
    // Arrange
    const g = pfdGeometry(346);
    const rates = [500, 1000, 1500, 2000, 4000, 6000, 9000, -1000];

    // Act
    const out = rates.map((v) => vsiOffset(g, v));

    // Assert
    const expected = [13.6875, 27.375, 37.4125, 47.45, 60.225, 73, 73, -27.375];
    expected.forEach((e, i) => expect(out[i]).toBeCloseTo(e, 4));
  });
});

describe('vsiY', () => {
  it('stands above the centre line for a climb and below it for a descent', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = [vsiY(g, 6000), vsiY(g, 0), vsiY(g, -6000)];

    // Assert
    expect(out).toEqual([50, 123, 196]);
  });
});

describe('vsiStripPath', () => {
  it('is the strip with its outer corners chamfered', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = vsiStripPath(g);

    // Assert
    expect(out).toBe('M322.0 42.0H336.0L345.0 64.0V182.0L336.0 204.0H322.0Z');
  });
});

describe('vsiScale', () => {
  it('marks zero and ±500 to ±6000 fpm, labelling 1, 2 and 6 thousand at both signs', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = vsiScale(g);

    // Assert
    expect(out.ticks.startsWith('M332.0 123.0h7')).toBe(true);
    expect((out.ticks.match(/M/g) ?? []).length).toBe(13);
    expect(out.labels.map((l) => l.text)).toEqual(['1', '1', '2', '2', '6', '6']);
    expect(out.labels.slice(4)).toEqual([
      { text: '6', x: 324, y: 50 },
      { text: '6', x: 324, y: 196 },
    ]);
  });
});

describe('vsiNeedlePath', () => {
  it('runs from the scale towards a pivot off the right edge, cut short of the edge', () => {
    // Arrange
    const g = pfdGeometry(346);

    // Act
    const out = vsiNeedlePath(g, 0);

    // Assert
    expect(out).toBe('M334.0 123.0L343.0 123.0');
  });
});

describe('vsiDigits', () => {
  it('prints from 400 fpm, to 50, above the strip for a climb and below it for a descent', () => {
    // Arrange
    const g = pfdGeometry(346);
    const rates = [399, 400, 1820, -2210];

    // Act
    const out = rates.map((v) => vsiDigits(g, v));

    // Assert
    expect(out).toEqual([
      undefined,
      { text: '400', x: 344, y: 32 },
      { text: '1800', x: 344, y: 32 },
      { text: '2200', x: 344, y: 214 },
    ]);
  });
});
