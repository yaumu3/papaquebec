import { describe, expect, it } from 'bun:test';

import {
  aircraftPath,
  arcPath,
  compass,
  lastHeardY,
  lubberPath,
  ndGeometry,
  rangeAnchors,
  ringPath,
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
