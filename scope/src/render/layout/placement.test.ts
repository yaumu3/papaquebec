import { describe, expect, it } from 'bun:test';

import type { View } from '../protocol';
import { makeTrack } from '../scene/trackFixture';
import { applyPlacement, blockSubjects, type PlacementInput, viewportRect } from './placement';

function input(over: Partial<PlacementInput> = {}): PlacementInput {
  return {
    tracks: [],
    now: 1000,
    pxPerNm: 10,
    filter: { ground: true, lowerFl: 0, upperFl: 500, squawk: 'all' },
    altimeter: { transitionAltFt: 14000, qnhInHg: 29.92 },
    selected: null,
    viewport: { x0: -400, y0: -300, x1: 400, y1: 300 },
    ...over,
  };
}

describe('blockSubjects', () => {
  it('puts a shown track in CSS px at the layout scale, y down, with its velocity per second', () => {
    // Arrange
    const t = makeTrack({
      gs: 360,
      track: 90,
      position: { kind: 'live', lat: 0, lon: 0, x: 1, y: 2 },
      ops: { dir: 3, movedAt: 990, manual: true },
    });

    // Act
    const [s] = blockSubjects(input({ tracks: [t] }));

    // Assert
    expect(s?.cx).toBe(10);
    expect(s?.cy).toBe(-20);
    expect(s?.vx).toBeCloseTo(1);
    expect(s?.vy).toBeCloseTo(0);
    expect(s?.dir).toBe(3);
    expect(s?.sinceMove).toBe(10);
    expect(s?.manual).toBe(true);
  });

  it('leaves out tracks that are filtered, unplaced or beyond the viewport', () => {
    // Arrange
    const shown = makeTrack({ hex: 'd00001' });
    const filtered = makeTrack({ hex: 'd00002', alt: 45000 });
    const unplaced = makeTrack({ hex: 'd00003', position: { kind: 'none' } });
    const far = makeTrack({
      hex: 'd00004',
      position: { kind: 'live', lat: 0, lon: 0, x: 100, y: 0 },
    });
    const band = { ground: true, lowerFl: 0, upperFl: 200, squawk: 'all' as const };

    // Act
    const subjects = blockSubjects(
      input({ tracks: [shown, filtered, unplaced, far], filter: band }),
    );

    // Assert
    expect(subjects.map((s) => s.hex)).toEqual(['d00001']);
  });

  it('carries the level, the turn rate from the last two samples and the last 30 s of fixes', () => {
    // Arrange
    const t = makeTrack({
      alt: 4000,
      history: [
        { lat: 0, lon: 0, x: 0, y: 0, t: 960, alt: 4000 },
        { lat: 0, lon: 0, x: 1, y: 1, t: 980, alt: 4000 },
        { lat: 0, lon: 0, x: 2, y: 2, t: 1000, alt: 4000 },
      ],
      samples: [
        { ...makeTrack(), t: 990, messageRate: undefined, track: 90 },
        { ...makeTrack(), t: 1000, messageRate: undefined, track: 120 },
      ],
    });

    // Act
    const [s] = blockSubjects(input({ tracks: [t] }));

    // Assert
    expect(s?.altitudeFt).toBe(4000);
    expect(s?.turnRateDegPerSec).toBeCloseTo(3);
    expect(s?.history).toEqual([
      { x: 20, y: -20 },
      { x: 10, y: -10 },
    ]);
  });

  it('has never moved a block that was never placed', () => {
    // Arrange
    const t = makeTrack();

    // Act
    const [s] = blockSubjects(input({ tracks: [t] }));

    // Assert
    expect(s?.dir).toBeNull();
    expect(s?.sinceMove).toBe(Infinity);
  });
});

describe('viewportRect', () => {
  it('is the canvas in the px the subjects use, at the layout scale', () => {
    // Arrange
    const view: View = { centerX: 2, centerY: 1, pxPerNm: 7, widthPx: 800, heightPx: 600, dpr: 1 };

    // Act
    const r = viewportRect(view, 10);

    // Assert
    expect(r).toEqual({ x0: 20 - 400, y0: -10 - 300, x1: 20 + 400, y1: -10 + 300 });
  });
});

describe('applyPlacement', () => {
  it('moves a block, notes when, and takes one the operator placed back once it moves', () => {
    // Arrange
    const kept = makeTrack({
      hex: 'd00001',
      ops: { dir: 3, movedAt: 900, manual: true },
    });
    const moved = makeTrack({
      hex: 'd00002',
      ops: { dir: 3, movedAt: 900, manual: true },
    });
    const fresh = makeTrack({
      hex: 'd00003',
      ops: { dir: null, movedAt: null, manual: false },
    });
    const dirs = new Map([
      ['d00001', 3],
      ['d00002', 5],
      ['d00003', 7],
    ]);
    const seen = [kept, moved, fresh].map((t) => ({
      hex: t.hex,
      dir: t.ops.dir,
      manual: t.ops.manual,
    }));

    // Act
    applyPlacement([kept, moved, fresh], dirs, 1000, seen);

    // Assert
    expect(kept.ops).toEqual({ dir: 3, movedAt: 900, manual: true });
    expect(moved.ops).toEqual({ dir: 5, movedAt: 1000, manual: false });
    expect(fresh.ops).toEqual({ dir: 7, movedAt: 1000, manual: false });
  });
});

describe('applyPlacement after a drag', () => {
  it('leaves a block the operator moved since the scene was sent', () => {
    // Arrange
    const dragged = makeTrack({
      hex: 'd00001',
      ops: { dir: 1, movedAt: 995, manual: true },
    });
    const seen = [{ hex: 'd00001', dir: 3, manual: false }];

    // Act
    applyPlacement([dragged], new Map([['d00001', 5]]), 1000, seen);

    // Assert
    expect(dragged.ops).toEqual({ dir: 1, movedAt: 995, manual: true });
  });
});
