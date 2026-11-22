import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import {
  contentMovesSheet,
  FLING_PX_PER_MS,
  projectFlick,
  rubberBand,
  settle,
  sheetFrame,
  type SheetStop,
  sheetStops,
} from './sheetMotion';

describe('rubberBand', () => {
  it('gives way less with every pixel pulled past the edge, never as far as the pull', () => {
    // Arrange: pulls a whole number of px apart, from none at all
    const anyRoom = fc.integer({ min: 200, max: 1200 });
    const anyPulls = fc
      .tuple(fc.integer({ min: 1, max: 1000 }), fc.integer({ min: 1, max: 1000 }))
      .map(([first, step]) => [0, first, first + step, first + 2 * step] as const);

    fc.assert(
      fc.property(anyPulls, anyRoom, (pulls, room) => {
        // Act
        const [none = 0, near = 0, mid = 0, far = 0] = pulls.map((pull) => rubberBand(pull, room));

        // Assert
        expect(none).toBe(0);
        expect(near).toBeGreaterThan(0);
        expect(near).toBeLessThan(pulls[1]);
        expect(mid - near).toBeGreaterThan(far - mid);
        expect(far - mid).toBeGreaterThan(0);
        expect(far).toBeLessThan(room);
      }),
    );
  });

  it('is as stiff as the rubber band of UIScrollView', () => {
    // Arrange
    const pull = 100;

    // Act
    const out = rubberBand(pull, 800);

    // Assert
    expect(out).toBeCloseTo(51.46, 2);
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
    // Arrange: a sheet of any detents, let go anywhere from below closed to above its largest
    const anyStops = fc
      .tuple(fc.integer({ min: 100, max: 600 }), fc.integer({ min: 100, max: 600 }))
      .map(([medium, more]): SheetStop[] => [
        { detent: null, extent: 0 },
        { detent: 'medium', extent: medium },
        { detent: 'large', extent: medium + more },
      ]);
    const anyExtent = fc.integer({ min: -100, max: 1400 });
    const anyFlick = fc.double({
      min: -FLING_PX_PER_MS,
      max: FLING_PX_PER_MS,
      minExcluded: true,
      maxExcluded: true,
      noNaN: true,
    });

    fc.assert(
      fc.property(anyStops, anyExtent, anyFlick, (sheet, extent, velocity) => {
        // Act
        const detent = settle(extent, velocity, sheet);

        // Assert: no stop lies between where it was let go and where it rests
        const rest = sheet.find((stop) => stop.detent === detent)?.extent ?? NaN;
        const passed = sheet.filter((stop) => (stop.extent - extent) * (stop.extent - rest) < 0);
        expect(rest).not.toBeNaN();
        expect(passed).toEqual([]);
      }),
    );
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
