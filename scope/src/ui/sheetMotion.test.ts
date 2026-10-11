import { describe, expect, it } from 'bun:test';

import {
  contentMovesSheet,
  FLING_PX_PER_MS,
  grabberShown,
  projectFlick,
  rubberBand,
  settle,
  sheetFrame,
  sheetStops,
} from './sheetMotion';

describe('rubberBand', () => {
  it('gives way less with every pixel pulled past the edge, never as far as the pull', () => {
    // Arrange
    const pulls = [0, 50, 100, 200, 400];

    // Act
    const out = pulls.map((p) => rubberBand(p, 800));

    // Assert
    expect(out.map(Math.round)).toEqual([0, 27, 51, 97, 173]);
  });
});

describe('projectFlick', () => {
  it('carries a flick as far as it would coast at iOS deceleration', () => {
    // Arrange
    const velocities = [0, 1, -2];

    // Act
    const out = velocities.map(projectFlick);

    // Assert
    expect(out[0]).toBe(0);
    expect(out[1]).toBeCloseTo(499, 0);
    expect(out[2]).toBeCloseTo(-998, 0);
  });
});

describe('sheetFrame', () => {
  it('grows between the smallest and largest detents, slides down below and stretches above', () => {
    // Arrange
    const extents = [500, 300, 100, -50, 900];

    // Act
    const out = extents.map((e) => sheetFrame(e, 400, 800));

    // Assert
    expect(out).toEqual([
      { height: 500, shift: 0 },
      { height: 400, shift: 100 },
      { height: 400, shift: 300 },
      { height: 400, shift: 400 },
      { height: 800 + rubberBand(100, 800), shift: 0 },
    ]);
  });
});

describe('settle', () => {
  const stops = [
    { detent: null, extent: 0 },
    { detent: 'medium', extent: 400 },
    { detent: 'large', extent: 800 },
  ] as const;

  it('rests a let-go sheet at the stop nearest where its flick would coast to', () => {
    // Arrange
    const releases: [number, number][] = [
      [450, 0],
      [650, 0],
      [450, 0.5],
      [750, -1],
      [150, 0],
    ];

    // Act
    const out = releases.map(([extent, velocity]) => settle(extent, velocity, stops));

    // Assert
    expect(out).toEqual(['medium', 'large', 'large', 'medium', null]);
  });

  it('never flicks a sheet past the stops either side of where it was let go, short of a fling', () => {
    // Arrange
    const flick = FLING_PX_PER_MS * 0.9;
    const releases: [number, number][] = [
      [780, -flick],
      [700, -flick],
      [350, -1],
      [100, flick],
    ];

    // Act
    const out = releases.map(([extent, velocity]) => settle(extent, velocity, stops));

    // Assert
    expect(out).toEqual(['medium', 'medium', null, 'medium']);
  });

  it('lets a fling carry a sheet past the next stop', () => {
    // Arrange
    const releases: [number, number][] = [
      [780, -FLING_PX_PER_MS],
      [100, FLING_PX_PER_MS],
    ];

    // Act
    const out = releases.map(([extent, velocity]) => settle(extent, velocity, stops));

    // Assert
    expect(out).toEqual([null, 'large']);
  });
});

describe('sheetStops', () => {
  it('lets a sheet rest closed or at each of its detents', () => {
    // Arrange
    const room = { medium: 400, large: 800 };

    // Act
    const out = sheetStops(['medium', 'large'], room);

    // Assert
    expect(out).toEqual([
      { detent: null, extent: 0 },
      { detent: 'medium', extent: 400 },
      { detent: 'large', extent: 800 },
    ]);
  });
});

describe('contentMovesSheet', () => {
  it('moves the sheet up short of its largest detent and down from the top of its content, else scrolls', () => {
    // Arrange
    const cases = [
      { up: 3, across: 0, atLargest: false, atTop: false },
      { up: 3, across: 0, atLargest: true, atTop: true },
      { up: -3, across: 0, atLargest: true, atTop: true },
      { up: -3, across: 0, atLargest: false, atTop: false },
      { up: 2, across: 3, atLargest: false, atTop: true },
      { up: 0, across: 0, atLargest: false, atTop: true },
    ];

    // Act
    const out = cases.map(contentMovesSheet);

    // Assert
    expect(out).toEqual([true, false, true, false, false, false]);
  });
});

describe('grabberShown', () => {
  it('shows the grabber only on a sheet with more than one detent to go between', () => {
    // Arrange
    const cases = [['medium', 'large'], ['large']] as const;

    // Act
    const out = cases.map(grabberShown);

    // Assert
    expect(out).toEqual([true, false]);
  });
});
