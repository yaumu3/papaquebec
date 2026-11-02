import { describe, expect, it } from 'bun:test';

import { actionsOf, actionTimes, summaryOf } from './actions';
import type { Recording } from './recorder';

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

const click = (at: number) => ({ at, kind: 'click' as const });

describe('actionTimes', () => {
  it('runs from the input to the first draw after the last chart post', () => {
    // Arrange
    const r = recording({
      actions: [{ at: 100, label: 'FIXES', input: 'click' }],
      inputs: [click(110)],
      posts: [
        { at: 120, slot: 'pointMarkers' },
        { at: 130, slot: 'routeLabels' },
      ],
      draws: [125, 135, 150],
    });

    // Act
    const [time] = actionTimes(r);

    // Assert
    expect(time).toEqual({ label: 'FIXES', toFrame: 25, longTaskMs: 0, longestMs: 0 });
  });

  it('ignores the slots traffic posts on its own', () => {
    // Arrange
    const r = recording({
      actions: [{ at: 100, label: 'FIXES', input: 'click' }],
      inputs: [click(110)],
      posts: [
        { at: 120, slot: 'traces' },
        { at: 200, slot: 'targets' },
        { at: 201, slot: 'hover' },
        { at: 202, slot: 'overlays' },
        { at: 203, slot: 'ringLabels' },
      ],
      draws: [125, 210],
    });

    // Act
    const [time] = actionTimes(r);

    // Assert
    expect(time?.toFrame).toBe(15);
  });

  it('leaves a post before the input or from the next action out of an action', () => {
    // Arrange
    const r = recording({
      actions: [
        { at: 100, label: 'one', input: 'click' },
        { at: 300, label: 'two', input: 'click' },
      ],
      inputs: [click(110), click(310)],
      posts: [
        { at: 105, slot: 'areaLines' },
        { at: 120, slot: 'areaLines' },
        { at: 320, slot: 'areaLines' },
      ],
      draws: [130, 330],
    });

    // Act
    const times = actionTimes(r);

    // Assert
    expect(times.map((t) => t.toFrame)).toEqual([20, 20]);
  });

  it('times from the input the action waits for, not an earlier kind', () => {
    // Arrange
    const r = recording({
      actions: [{ at: 100, label: '40 NM', input: 'settle' }],
      inputs: [click(105), { at: 260, kind: 'settle' }],
      posts: [{ at: 270, slot: 'routeLabels' }],
      draws: [280],
    });

    // Act
    const [time] = actionTimes(r);

    // Assert
    expect(time?.toFrame).toBe(20);
  });

  it('gives no time to an action that posted nothing to a chart slot', () => {
    // Arrange
    const r = recording({
      actions: [{ at: 100, label: 'FIXES', input: 'click' }],
      inputs: [click(110)],
      posts: [{ at: 120, slot: 'targets' }],
      draws: [130],
    });

    // Act
    const [time] = actionTimes(r);

    // Assert
    expect(time).toEqual({ label: 'FIXES', toFrame: null, longTaskMs: 0, longestMs: 0 });
  });

  it('gives no time to an action whose input never came', () => {
    // Arrange
    const r = recording({
      actions: [{ at: 100, label: '40 NM', input: 'settle' }],
      inputs: [click(110)],
      posts: [{ at: 120, slot: 'routeLabels' }],
      draws: [130],
    });

    // Act
    const [time] = actionTimes(r);

    // Assert
    expect(time?.toFrame).toBeNull();
  });

  it('adds up the long tasks that overlap the window, and keeps the longest', () => {
    // Arrange
    const r = recording({
      actions: [{ at: 100, label: 'SECTORS', input: 'click' }],
      inputs: [click(110)],
      posts: [{ at: 300, slot: 'areaLines' }],
      draws: [320],
      longTasks: [
        { at: 40, ms: 60 },
        { at: 90, ms: 60 },
        { at: 200, ms: 120 },
        { at: 320, ms: 80 },
      ],
    });

    // Act
    const [time] = actionTimes(r);

    // Assert
    expect(time).toMatchObject({ toFrame: 210, longTaskMs: 180, longestMs: 120 });
  });
});

describe('summaryOf', () => {
  it('gives the p50 and max of the times, and counts what posted nothing apart', () => {
    // Arrange
    const times = [
      { label: 'a', toFrame: 10, longTaskMs: 0, longestMs: 0 },
      { label: 'a', toFrame: 30, longTaskMs: 60, longestMs: 60 },
      { label: 'a', toFrame: 20, longTaskMs: 130, longestMs: 70 },
      { label: 'a', toFrame: null, longTaskMs: 0, longestMs: 0 },
    ];

    // Act
    const summary = summaryOf(times);

    // Assert
    expect(summary).toEqual({
      actions: 4,
      noPost: 1,
      toFrameP50: 20,
      toFrameMax: 30,
      longTaskP50: 60,
      longTaskMax: 130,
      longestMs: 70,
    });
  });
});

describe('actionsOf', () => {
  it('sums a scenario up, whole and by label when it has several', () => {
    // Arrange
    const times = [
      { label: 'a', toFrame: 10, longTaskMs: 0, longestMs: 0 },
      { label: 'b', toFrame: 30, longTaskMs: 0, longestMs: 0 },
    ];

    // Act
    const { whole, byLabel } = actionsOf(times);

    // Assert
    expect(whole.actions).toBe(2);
    expect(Object.keys(byLabel)).toEqual(['a', 'b']);
    expect(byLabel.b?.toFrameMax).toBe(30);
  });

  it('has no rows by label for one label', () => {
    // Arrange
    const times = [{ label: 'a', toFrame: 10, longTaskMs: 0, longestMs: 0 }];

    // Act
    const { byLabel } = actionsOf(times);

    // Assert
    expect(byLabel).toEqual({});
  });
});
