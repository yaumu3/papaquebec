import { afterEach, describe, expect, it } from 'bun:test';

import type { Scene, Subject } from './placement';
import { createPlacer, type Placer, workerPlacer } from './placer';

function subject(hex: string, cx: number): Subject {
  return {
    hex,
    cx,
    cy: 0,
    vx: 0,
    vy: 0,
    extraLines: 0,
    dir: null,
    sinceMove: Infinity,
    manual: false,
    altitudeFt: 5000,
    turnRateDegPerSec: 0,
    history: [],
  };
}

const sceneOf = (...hexes: string[]): Scene => ({
  subjects: hexes.map((hex, i) => subject(hex, 30 * i)),
  pxPerNm: 10,
});

/** A send that records what it was given and answers only when told to. */
function deferredSend() {
  const sent: Scene[] = [];
  const answers: ((dirs: Map<string, number>) => void)[] = [];
  const send = (scene: Scene) =>
    new Promise<Map<string, number>>((resolve) => {
      sent.push(scene);
      answers.push(resolve);
    });
  const answer = async (k: number, dirs: Map<string, number>) => {
    answers[k]?.(dirs);
    await Promise.resolve();
    await Promise.resolve();
  };
  return { send, sent, answer };
}

describe('createPlacer', () => {
  it('sends a scene at once while nothing is in flight', () => {
    // Arrange
    const { send, sent } = deferredSend();
    const placer = createPlacer(send);
    const scene = sceneOf('a');

    // Act
    placer.place(scene, () => {});

    // Assert
    expect(sent).toEqual([scene]);
  });

  it('delivers a reply that no newer scene has overtaken', async () => {
    // Arrange
    const { send, answer } = deferredSend();
    const placer = createPlacer(send);
    const placed: ReadonlyMap<string, number>[] = [];
    placer.place(sceneOf('a'), (dirs) => placed.push(dirs));

    // Act
    await answer(0, new Map([['a', 5]]));

    // Assert
    expect(placed).toEqual([new Map([['a', 5]])]);
  });

  it('keeps only the newest scene behind the one in flight, and drops the reply it overtook', async () => {
    // Arrange
    const { send, sent, answer } = deferredSend();
    const placer = createPlacer(send);
    const placed: string[] = [];
    const first = sceneOf('a');
    const second = sceneOf('b');
    const third = sceneOf('c');
    placer.place(first, () => placed.push('first'));
    placer.place(second, () => placed.push('second'));
    placer.place(third, () => placed.push('third'));

    // Act
    await answer(0, new Map([['a', 5]]));

    // Assert
    expect(sent).toEqual([first, third]);
    expect(placed).toEqual([]);
  });

  it('carries on after a placement fails', async () => {
    // Arrange
    const sent: Scene[] = [];
    let failed = false;
    const send = (scene: Scene) => {
      sent.push(scene);
      if (failed) return Promise.resolve(new Map<string, number>());
      failed = true;
      return Promise.reject(new Error('worker gone'));
    };
    const placer = createPlacer(send);
    placer.place(sceneOf('a'), () => {});
    await Promise.resolve();
    await Promise.resolve();

    // Act
    placer.place(sceneOf('b'), () => {});

    // Assert
    expect(sent.map((s) => s.subjects[0]?.hex)).toEqual(['a', 'b']);
  });
});

describe('workerPlacer', () => {
  let placer: Placer;
  afterEach(() => placer.destroy());

  it('answers a scene from the worker with a bearing for every subject', async () => {
    // Arrange
    placer = workerPlacer();
    const scene = sceneOf('a', 'b');

    // Act
    const dirs = await new Promise<ReadonlyMap<string, number>>((resolve) => {
      placer.place(scene, resolve);
    });

    // Assert
    expect([...dirs.keys()].toSorted()).toEqual(['a', 'b']);
    for (const d of dirs.values()) expect(d).toBeWithin(0, 8);
  });
});
