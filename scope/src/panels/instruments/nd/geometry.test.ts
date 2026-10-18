import { describe, expect, it } from 'bun:test';

import {
  aircraftPath,
  arcPath,
  bugPath,
  compass,
  diamondPath,
  lastHeardY,
  levelOffPath,
  lubberPath,
  type NdGeometry,
  ndGeometry,
  rangeAnchors,
  ringPath,
  threatSquarePath,
  trafficDiamondPath,
  trackPath,
  trendPath,
  trendPoints,
  windArrowPath,
} from './geometry';

const segments = (path: string): number => (path.match(/M/g) ?? []).length;

describe('ndGeometry', () => {
  it('takes the whole of its size from the width, whichever limit binds', () => {
    // Arrange
    const widths = [346, 200];

    // Act
    const out = widths.map(ndGeometry);

    // Assert
    expect(out).toEqual([
      { w: 346, h: 230, cx: 173, cy: 189, r: 149, r2: 74.5 },
      { w: 200, h: 133, cx: 100, cy: 113, r: 73, r2: 36.5 },
    ]);
  });
});

describe('arcPath', () => {
  it('runs from 55° left of the top to 55° right of it', () => {
    // Arrange
    const g = ndGeometry(346);

    // Act
    const path = arcPath(g, g.r);

    // Assert
    expect(path).toBe('M50.9 103.5A149.0 149.0 0 0 1 295.1 103.5');
  });

  it('draws the half-range ring on the same span at half the radius', () => {
    // Arrange
    const g = ndGeometry(346);

    // Act
    const path = ringPath(g);

    // Assert
    expect(path).toBe(arcPath(g, g.r2));
  });
});

describe('compass', () => {
  const g = ndGeometry(346);

  it('ticks every 5° across a turn through north, the tens heavier', () => {
    // Arrange
    const orient = 350;

    // Act
    const marks = compass(g, orient);

    // Assert
    expect([segments(marks.major), segments(marks.minor)]).toEqual([11, 12]);
  });

  it('labels the tens in tens of degrees, the multiples of three large', () => {
    // Arrange
    const orient = 350;

    // Act
    const marks = compass(g, orient);

    // Assert
    expect(marks.labels.map((l) => l.text)).toEqual([
      '30',
      '31',
      '32',
      '33',
      '34',
      '35',
      '0',
      '1',
      '2',
      '3',
      '4',
    ]);
    expect(marks.labels.filter((l) => l.big).map((l) => l.text)).toEqual(['30', '33', '0', '3']);
  });

  it('places a label inside the arc, further in for a large one', () => {
    // Arrange
    const orient = 350;

    // Act
    const [first] = compass(g, orient).labels;

    // Assert
    expect([first?.x, first?.y]).toEqual([75.7, 107.4]);
  });

  it('leaves out the labels past 50° and keeps their ticks', () => {
    // Arrange
    const orient = 345;

    // Act
    const marks = compass(g, orient);

    // Assert
    expect(marks.labels.map((l) => l.text)).toEqual([
      '30',
      '31',
      '32',
      '33',
      '34',
      '35',
      '0',
      '1',
      '2',
      '3',
    ]);
    expect(segments(marks.major)).toBe(12);
  });
});

describe('anchors', () => {
  it('puts the range labels 4 px left of the arc ends, and LAST HEARD over the ring', () => {
    // Arrange
    const g = ndGeometry(346);

    // Act
    const out = { ranges: rangeAnchors(g), lastHeard: lastHeardY(g) };

    // Assert
    expect(out).toEqual({
      ranges: { outer: { x: 46.9, y: 103.5 }, half: { x: 108, y: 146.3 } },
      lastHeard: 106.5,
    });
  });
});

describe('fixed symbols', () => {
  it('draws the lubber line across the arc and the aircraft apex up at the centre', () => {
    // Arrange
    const g = ndGeometry(346);

    // Act
    const out = { lubber: lubberPath(g), aircraft: aircraftPath(g) };

    // Assert
    expect(out).toEqual({
      lubber: 'M173.0 27.0L173.0 43.0',
      aircraft: 'M173.0 179.0L179.0 197.0L167.0 197.0Z',
    });
  });
});

describe('track line and diamond', () => {
  const g = ndGeometry(346);

  it('draws the line from near the aircraft out to the arc, crossed at the ring', () => {
    // Arrange
    const at = 0;

    // Act
    const path = trackPath(g, at);

    // Assert
    expect(path).toBe('M173.0 175.0L173.0 52.0M169.0 114.5L177.0 114.5');
  });

  it('draws the diamond on the arc, closed', () => {
    // Arrange
    const at = 0;

    // Act
    const path = diamondPath(g, at);

    // Assert
    expect(path).toBe('M173.0 34.0L177.0 40.0L173.0 46.0L169.0 40.0Z');
  });

  it('draws neither where the track is off the arc', () => {
    // Arrange
    const at = 70;

    // Act
    const paths = [trackPath(g, at), diamondPath(g, at)];

    // Assert
    expect(paths).toEqual(['', '']);
  });
});

const vertices = (path: string): [number, number][] => {
  const numbers = (path.match(/-?\d+\.\d/g) ?? []).map(Number);
  return Array.from({ length: numbers.length / 2 }, (_, i) => [
    numbers[2 * i] ?? 0,
    numbers[2 * i + 1] ?? 0,
  ]);
};
const bearingOf = (g: NdGeometry, [x, y]: [number, number]): number =>
  (Math.atan2(x - g.cx, g.cy - y) * 180) / Math.PI;

describe('bugPath', () => {
  const g = ndGeometry(346);

  it('draws the whole bug, closed, at its bearing while that is on the arc', () => {
    // Arrange
    const rels = [0, 30, -55, 55];

    // Act
    const paths = rels.map((rel) => bugPath(g, rel));

    // Assert
    expect(paths[0]).toBe(
      'M166.0 31.0L180.0 31.0L180.0 39.0L176.0 39.0L173.0 35.0L170.0 39.0L166.0 39.0Z',
    );
    expect(paths.map((p) => [p.endsWith('Z'), vertices(p).length])).toEqual(
      rels.map(() => [true, 7]),
    );
  });

  it('draws only the half inside the arc, open, at the end of it for a bearing off it', () => {
    // Arrange
    const rels = [100, -100];

    // Act
    const paths = rels.map((rel) => bugPath(g, rel));

    // Assert
    expect(paths.map((p) => [p.includes('Z'), vertices(p).length])).toEqual([
      [false, 5],
      [false, 5],
    ]);
    const [right, left] = paths.map((p) => vertices(p).map((v) => bearingOf(g, v)));
    expect(Math.max(...(right ?? []))).toBeCloseTo(55, 1);
    expect(Math.max(...(right ?? []).map(Math.abs))).toBeLessThan(55.1);
    expect(Math.min(...(left ?? []))).toBeCloseTo(-55, 1);
    expect(Math.max(...(left ?? []).map(Math.abs))).toBeLessThan(55.1);
  });

  it('parks the same however far off the arc the bearing is', () => {
    // Arrange
    const rels = [100, 170];

    // Act
    const paths = rels.map((rel) => bugPath(g, rel));

    // Assert
    expect(paths[0]).toBe(paths[1]);
  });

  it('mirrors the half bug at the left end from the one at the right end', () => {
    // Arrange
    const mirrored = vertices(bugPath(g, 100)).map(([x, y]): [number, number] => [2 * g.cx - x, y]);

    // Act
    const left = vertices(bugPath(g, -100));

    // Assert
    expect(left?.map(([x]) => x)).toEqual(mirrored.map(([x]) => expect.closeTo(x, 1)));
    expect(left?.map(([, y]) => y)).toEqual(mirrored.map(([, y]) => y));
  });
});

const turning = (rateDegS: number) => ({ rateDegS, gsKt: 360 });
const lengthOf = (points: readonly (readonly [number, number])[]): number =>
  points.reduce((sum, p, i, all) => {
    const from = all[i - 1];
    return from ? sum + Math.hypot(p[0] - from[0], p[1] - from[1]) : sum;
  }, 0);

describe('trend vector', () => {
  const g = ndGeometry(346);

  it('steps 90 s at the ground speed scaled to the range, from just above the aircraft', () => {
    // Arrange
    const speed = turning(1);

    // Act
    const points = trendPoints(g, 0, speed, 20);

    // Assert
    expect(points).toHaveLength(91);
    expect(points[0]).toEqual([173, 180]);
    expect(lengthOf(points)).toBeCloseTo(67.05, 6);
  });

  it('curves to the side the track turns', () => {
    // Arrange
    const rates = [1, -1, 0];

    // Act
    const ends = rates.map((rate) => trendPoints(g, 0, turning(rate), 20).at(-1)?.[0] ?? 0);

    // Assert
    expect(ends.map((x) => Math.sign(Math.round((x - g.cx) * 1e6)))).toEqual([1, -1, 0]);
  });

  it('draws three dashes, one for each 30 s', () => {
    // Arrange
    const points = trendPoints(g, 0, turning(0), 20);

    // Act
    const path = trendPath(points);

    // Assert
    expect(segments(path)).toBe(3);
    expect(path.startsWith('M173.0 179.3L173.0 178.5')).toBe(true);
  });
});

describe('levelOffPath', () => {
  const g = ndGeometry(346);

  it('draws an arc of 11° either side of the track at the distance, on the scale of the range', () => {
    // Arrange
    const nm = 10;

    // Act
    const path = levelOffPath(g, 0, nm, 20);

    // Assert
    expect(path).toBe('M158.8 115.9A74.5 74.5 0 0 1 187.2 115.9');
  });

  it('draws none too near the aircraft or at or beyond the arc', () => {
    // Arrange
    const nms = [1, 25, 20];

    // Act
    const paths = nms.map((nm) => levelOffPath(g, 0, nm, 20));

    // Assert
    expect(paths).toEqual(['', '', '']);
  });
});

describe('windArrowPath', () => {
  it('points downwind from a fixed place, with an open head', () => {
    // Arrange
    const from = 270;

    // Act
    const path = windArrowPath(from);

    // Assert
    expect(path).toBe('M6.0 60.0L26.0 60.0M21.0 63.5L26.0 60.0L21.0 56.5');
  });

  it('points down the display for a wind from the top', () => {
    // Arrange
    const from = 0;

    // Act
    const path = windArrowPath(from);

    // Assert
    expect(path.startsWith('M16.0 50.0L16.0 70.0')).toBe(true);
  });
});

describe('traffic symbols', () => {
  it('draws the diamond with a 5.5 px half-diagonal about its centre', () => {
    // Arrange
    const at: [number, number] = [100, 50];

    // Act
    const path = trafficDiamondPath(...at);

    // Assert
    expect(path).toBe('M100.0 44.5L105.5 50.0L100.0 55.5L94.5 50.0Z');
  });

  it('draws the threat as a 9 px square about its centre', () => {
    // Arrange
    const at: [number, number] = [100, 50];

    // Act
    const path = threatSquarePath(...at);

    // Assert
    expect(path).toBe('M95.5 45.5L104.5 45.5L104.5 54.5L95.5 54.5Z');
  });
});
