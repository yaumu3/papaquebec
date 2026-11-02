import { describe, expect, it } from 'bun:test';

import type { Recording } from './recorder';
import { pct, rowsOf, summarize } from './report';

const recording = (over: Partial<Recording>): Recording => ({
  frames: [],
  longTasks: [],
  messages: {},
  inputs: [],
  posts: [],
  draws: [],
  actions: [],
  ...over,
});

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
    const pan = recording({
      frames: [16, 17, 25, 26],
      longTasks: [
        { at: 1, ms: 60 },
        { at: 2, ms: 70 },
      ],
    });

    // Act
    const summary = summarize('pan', pan, new Map([['buildTargets', 3]]));

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
      recording({
        frames: [16.7],
        messages: { draw: { n: 2, bytes: 0 }, 'slot:targets': { n: 1, bytes: 2_500_000 } },
      }),
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

  it('adds the actions, whole and by label, and counts those with no chart post', () => {
    // Arrange
    const summary = summarize(
      'toggle',
      recording({
        actions: [
          { at: 100, label: 'SECTORS', input: 'click' },
          { at: 200, label: 'FIXES', input: 'click' },
        ],
        inputs: [
          { at: 110, kind: 'click' },
          { at: 210, kind: 'click' },
        ],
        posts: [{ at: 120, slot: 'areaLines' }],
        draws: [130],
      }),
      new Map(),
    );

    // Act
    const rows = rowsOf(summary);

    // Assert
    expect(rows.slice(3)).toEqual([
      '         actions   ×2  to frame p50 20.0 max 20.0 ms  long p50 0.0 max 0.0 ms  longest 0.0 ms  no chart post ×1',
      '         SECTORS   ×1  to frame p50 20.0 max 20.0 ms  long p50 0.0 max 0.0 ms  longest 0.0 ms',
      '         FIXES     ×1  to frame p50 0.0 max 0.0 ms  long p50 0.0 max 0.0 ms  longest 0.0 ms  no chart post ×1',
    ]);
  });
});
