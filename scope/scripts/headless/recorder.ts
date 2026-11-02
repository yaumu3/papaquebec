/**
 * The page side of the load test: a long-task observer, a frame-interval recorder and a tap on
 * messages to the workers, which the scenarios start and stop.
 */

/** What one scenario leaves behind. */
export interface Recording {
  frames: number[];
  longTasks: number[];
  /** Per message kind: how many were posted to the worker and the bytes of batches they carried. */
  messages: Record<string, { n: number; bytes: number }>;
}

interface Recorder {
  start: () => void;
  stop: () => Recording;
}

declare global {
  interface Window {
    benchRecorder: Recorder;
  }
}

/** A message a recorder counts: what `postMessage` was given, narrowed to what it reads. */
interface Tapped {
  type: string;
  name?: string;
  batches?: { data: ArrayBufferView }[];
}

/** Run in the page by `page.evaluate`, so it reads nothing from this module. */
export function installRecorder(): void {
  /** What is being recorded; null between scenarios. */
  let now: Recording | null = null;
  let last = 0;

  const count = (into: Recording, m: Tapped) => {
    const key = m.type === 'slot' ? `slot:${m.name}` : m.type;
    const message = (into.messages[key] ??= { n: 0, bytes: 0 });
    message.n += 1;
    message.bytes += (m.batches ?? []).reduce((a, b) => a + b.data.byteLength, 0);
  };

  // oxlint-disable-next-line typescript/unbound-method -- applied to its worker below
  const post = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (this: Worker, ...args: [message: unknown]) {
    const [m] = args;
    if (now && m && typeof m === 'object' && 'type' in m && typeof m.type === 'string') {
      count(now, { ...m, type: m.type });
    }
    post.apply(this, args);
  };

  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) now?.longTasks.push(e.duration);
  }).observe({ type: 'longtask' });

  const tick = (t: number) => {
    if (now && last) now.frames.push(t - last);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  window.benchRecorder = {
    start() {
      now = { frames: [], longTasks: [], messages: {} };
      last = 0;
    },
    stop() {
      const done = now;
      now = null;
      if (!done) throw new Error('the recorder was not started');
      return done;
    },
  };
}
