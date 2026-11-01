import { describe, expect, it } from 'bun:test';

import { type Batch } from '../protocol';
import { buildHover, type HoverInput } from './hover';
import { makeTrack } from './trackFixture';

function input(over: Partial<HoverInput> = {}): HoverInput {
  return {
    track: makeTrack(),
    selected: null,
    filter: { ground: true, lowerFl: 0, upperFl: 500, squawk: 'all' },
    altimeter: { transitionAltFt: 14000, qnhInHg: 29.92 },
    labelDrag: null,
    moves: new Map(),
    drawAt: 0,
    instant: null,
    ...over,
  };
}

/** Offsets into a line instance; see `pack.ts`. */
const LINE_B_PX = 6;
const batch = (batches: Batch[], kind: Batch['kind']) => batches.find((b) => b.kind === kind);
const count = (batches: Batch[]) => batches.reduce((n, b) => n + b.count, 0);

describe('buildHover', () => {
  it('draws nothing without a target, for the selected one, a filtered one or one without a position', () => {
    // Arrange
    const t = makeTrack();
    const cases = [
      input({ track: null }),
      input({ track: t, selected: t.hex }),
      input({ track: t, filter: { ground: true, lowerFl: 200, upperFl: 500, squawk: 'all' } }),
      input({ track: makeTrack({ position: { kind: 'none' } }) }),
    ];

    // Act
    const drawn = cases.map((c) => count(buildHover(c)));

    // Assert
    expect(drawn).toEqual([0, 0, 0, 0]);
  });

  it('runs the leader to a block being dragged rather than to its direction', () => {
    // Arrange
    const t = makeTrack();
    const labelDrag = { hex: t.hex, dx: 60, dy: 30 };

    // Act
    const lines = batch(buildHover(input({ track: t, labelDrag })), 'lines');

    // Assert
    expect(lines?.count).toBe(1);
    expect(lines?.data[LINE_B_PX]).toBeCloseTo(60 - (3 * 60) / Math.hypot(60, 30));
  });
});
