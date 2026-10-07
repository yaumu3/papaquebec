import type { Scene } from './placement';

/** A scene sent off to be placed, answered with a bearing for every subject. */
export type Send = (scene: Scene) => Promise<Map<string, number>>;

export interface ToPlacer {
  scene: Scene;
}

export interface FromPlacer {
  dirs: Map<string, number>;
}

export interface Placer {
  /**
   * Places the scene, or holds it until the placer is free in place of any scene still
   * waiting. `onPlaced` runs with the bearings unless a newer scene came first.
   */
  place(scene: Scene, onPlaced: (dirs: ReadonlyMap<string, number>) => void): void;
  destroy(): void;
}

interface Request {
  scene: Scene;
  onPlaced: (dirs: ReadonlyMap<string, number>) => void;
}

/**
 * One scene in flight at a time and the newest behind it, so the placer never falls behind
 * the snapshots: a reply overtaken by a newer scene is dropped, and that scene goes next.
 */
export function createPlacer(send: Send, destroy: () => void = () => {}): Placer {
  let busy = false;
  let waiting: Request | null = null;
  const settle = (deliver: () => void) => {
    busy = false;
    const next = waiting;
    waiting = null;
    if (next) run(next);
    else deliver();
  };
  const run = (request: Request) => {
    busy = true;
    void send(request.scene).then(
      (dirs) => settle(() => request.onPlaced(dirs)),
      () => settle(() => {}),
    );
  };
  return {
    place(scene, onPlaced) {
      const request = { scene, onPlaced };
      if (busy) waiting = request;
      else run(request);
    },
    destroy,
  };
}

/** The placer in a worker of its own, so a layout never holds up a frame. */
export function workerPlacer(): Placer {
  const worker = new Worker(new URL('./placerWorker.ts', import.meta.url), { type: 'module' });
  let pending: { resolve: (dirs: Map<string, number>) => void; reject: (e: Error) => void } | null =
    null;
  worker.addEventListener('message', (e: MessageEvent<FromPlacer>) => {
    pending?.resolve(e.data.dirs);
    pending = null;
  });
  worker.addEventListener('error', (e) => {
    pending?.reject(new Error(e.message));
    pending = null;
  });
  const send: Send = (scene) =>
    new Promise((resolve, reject) => {
      pending = { resolve, reject };
      const message: ToPlacer = { scene };
      worker.postMessage(message);
    });
  return createPlacer(send, () => worker.terminate());
}
