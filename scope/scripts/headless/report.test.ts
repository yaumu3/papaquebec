import { describe, expect, it } from 'bun:test';

import { pct, rowsOf, summarize } from './report';

describe('pct', () => {
  it('reads the value that share of the way up, whatever the order', () => {
    // Arrange
    const xs = [40, 10, 30, 20];

    // Act
    const read = [pct(xs, 0), pct(xs, 50), pct(xs, 95), pct(xs, 100)];

    // Assert
    expect(read).toEqual([10, 30, 40, 40]);
  });

  it('reads nothing as 0', () => {
    // Arrange
    const none: number[] = [];

    // Act
    const read = pct(none, 50);

    // Assert
    expect(read).toBe(0);
  });
});

describe('summarize', () => {
  it('counts the frames past a vsync and adds up the long tasks', () => {
    // Arrange
    const recording = { frames: [16, 17, 25, 26], longTasks: [60, 70], messages: {} };

    // Act
    const summary = summarize('pan', recording, new Map([['buildTargets', 3]]));

    // Assert
    expect(summary).toMatchObject({
      frames: 4,
      frameMax: 26,
      janky: 1,
      longTasks: 2,
      longTaskMs: 130,
      ms: { buildTargets: 3 },
    });
  });
});

describe('rowsOf', () => {
  it('prints the frames, what was sent and the functions that took time', () => {
    // Arrange
    const summary = summarize(
      'idle',
      {
        frames: [16.7],
        longTasks: [],
        messages: { draw: { n: 2, bytes: 0 }, 'slot:targets': { n: 1, bytes: 2_500_000 } },
      },
      new Map([
        ['buildTargets', 1.25],
        ['buildHover', 0],
      ]),
    );

    // Act
    const rows = rowsOf(summary);

    // Assert
    expect(rows).toEqual([
      'idle   frames    1  p50 16.7 p95 16.7 max 16.7 ms  janky 0  long 0 (0.0 ms)',
      '         sent  draw ×2  slot:targets ×1 (2.5 MB)',
      '         time  buildTargets 1.3 ms',
    ]);
  });
});
