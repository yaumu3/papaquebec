/**
 * The page side of the load test: a long-task observer, a frame-interval recorder, a tap on
 * messages to the workers and listeners for the inputs, which the scenarios start and stop.
 * Every time is the page's own clock, as `performance.now()` reads it.
 */
import type { SlotName } from '../../src/render/slots';

/** A DOM event an action can start from, or `settle`, the zoom settle delay firing. */
export type InputKind = 'change' | 'click' | 'keydown' | 'pointerover' | 'settle';

/** An action about to be taken: its input is the first of `input` after `at`. */
export interface ActionMark {
  at: number;
  label: string;
  input: InputKind;
}

/** What one scenario leaves behind. */
export interface Recording {
  frames: number[];
  longTasks: { at: number; ms: number }[];
  /** Per message kind: how many were posted to the worker and the bytes of batches they carried. */
  messages: Record<string, { n: number; bytes: number }>;
  inputs: { at: number; kind: InputKind }[];
  posts: { at: number; slot: SlotName }[];
  draws: number[];
  actions: ActionMark[];
}

interface Recorder {
  start: () => void;
  stop: () => Recording;
  /** Marks an action about to be taken. */
  action: (label: string, input: InputKind) => void;
  /**
   * Resolves once the last action has finished: past `restMs` since a post to one of the action
   * slots with a draw after it, or `waitMs` with no post at all.
   */
  acted: (waitMs: number, restMs: number) => Promise<void>;
}

declare global {
  interface Window {
    benchRecorder: Recorder;
  }
}

/** A message a recorder counts: what `postMessage` was given, narrowed to what it reads. */
interface Tapped {
  type: string;
  name?: SlotName;
  batches?: { data: ArrayBufferView }[];
}

export interface RecorderOptions {
  /** The delay of the zoom settle timer, the only timer of its length. */
  settleMs: number;
  /** The slots an action can post to. */
  actionSlots: readonly SlotName[];
}

/** Run in the page by `page.evaluate`, so it reads nothing from this module. */
export function installRecorder({ settleMs, actionSlots }: RecorderOptions): void {
  /** What is being recorded; null between scenarios. */
  let now: Recording | null = null;
  let last = 0;
  /** When the current action began and when it last posted to an action slot, 0 before it has. */
  let began = 0;
  let lastPost = 0;
  let lastDraw = 0;

  const count = (into: Recording, m: Tapped) => {
    const key = m.type === 'slot' ? `slot:${m.name}` : m.type;
    const message = (into.messages[key] ??= { n: 0, bytes: 0 });
    message.n += 1;
    message.bytes += (m.batches ?? []).reduce((a, b) => a + b.data.byteLength, 0);
  };

  const stamp = (into: Recording, { type, name }: Tapped) => {
    const at = performance.now();
    if (type === 'draw') {
      into.draws.push(at);
      lastDraw = at;
    } else if (type === 'slot' && name) {
      into.posts.push({ at, slot: name });
      if (actionSlots.includes(name)) lastPost = at;
    }
  };

  // oxlint-disable-next-line typescript/unbound-method -- applied to its worker below
  const post = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (this: Worker, ...args: [message: unknown]) {
    const [m] = args;
    if (now && m && typeof m === 'object' && 'type' in m && typeof m.type === 'string') {
      count(now, { ...m, type: m.type });
      stamp(now, { ...m, type: m.type });
    }
    post.apply(this, args);
  };

  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) now?.longTasks.push({ at: e.startTime, ms: e.duration });
  }).observe({ type: 'longtask' });

  const tick = (t: number) => {
    if (now && last) now.frames.push(t - last);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  for (const kind of ['change', 'click', 'keydown', 'pointerover'] as const) {
    window.addEventListener(kind, (e) => now?.inputs.push({ at: e.timeStamp, kind }), true);
  }

  const setTimer = window.setTimeout.bind(window);
  const settling = (fn: () => void) => () => {
    now?.inputs.push({ at: performance.now(), kind: 'settle' });
    fn();
  };
  window.setTimeout = Object.assign(
    (fn: () => void, ms?: number) => setTimer(ms === settleMs ? settling(fn) : fn, ms),
    setTimer,
  );

  window.benchRecorder = {
    start() {
      now = {
        frames: [],
        longTasks: [],
        messages: {},
        inputs: [],
        posts: [],
        draws: [],
        actions: [],
      };
      last = 0;
    },
    stop() {
      const done = now;
      now = null;
      if (!done) throw new Error('the recorder was not started');
      return done;
    },
    action(label, input) {
      began = performance.now();
      lastPost = 0;
      now?.actions.push({ at: began, label, input });
    },
    acted(waitMs, restMs) {
      const finished = () => {
        const t = performance.now();
        if (lastPost === 0) return t - began >= waitMs;
        return t - lastPost >= (lastDraw >= lastPost ? restMs : waitMs);
      };
      return new Promise((resolve) => {
        const poll = () => (finished() ? resolve() : setTimer(poll, 20));
        poll();
      });
    },
  };
}
