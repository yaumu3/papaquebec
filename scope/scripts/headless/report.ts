/** What the load test makes of a recording: the figures of a scenario, and their printed rows. */
import { type ActionSummary, actionsOf, actionTimes } from './actions';
import type { Recording } from './recorder';

/** A frame longer than this, in ms, missed its vsync. */
const JANKY_MS = 25;

/** The value `p` percent of the way up `xs`. */
export const pct = (xs: readonly number[], p: number): number => {
  const s = xs.toSorted((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
};
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const f1 = (n: number) => n.toFixed(1);

export function summarize(name: string, s: Recording, ms: ReadonlyMap<string, number>) {
  return {
    scenario: name,
    frames: s.frames.length,
    frameP50: pct(s.frames, 50),
    frameP95: pct(s.frames, 95),
    frameMax: Math.max(0, ...s.frames),
    janky: s.frames.filter((f) => f > JANKY_MS).length,
    longTasks: s.longTasks.length,
    longTaskMs: sum(s.longTasks.map((t) => t.ms)),
    messages: s.messages,
    ms: Object.fromEntries(ms),
    ...(s.actions.length > 0 ? { actions: actionsOf(actionTimes(s)) } : {}),
  };
}

export type Summary = ReturnType<typeof summarize>;

/** A row of actions: the time to frame and the long tasks of each, those that posted no chart slot apart. */
const actionRow = (title: string, a: ActionSummary) =>
  `         ${title.padEnd(10)}×${a.actions}  ` +
  `to frame p50 ${f1(a.toFrameP50)} max ${f1(a.toFrameMax)} ms  ` +
  `long p50 ${f1(a.longTaskP50)} max ${f1(a.longTaskMax)} ms  longest ${f1(a.longestMs)} ms` +
  (a.noPost > 0 ? `  no chart post ×${a.noPost}` : '');

/** A scenario's rows: its frames and long tasks, what it sent, where the time went, its actions. */
export function rowsOf(r: Summary): string[] {
  const sent = Object.entries(r.messages).map(
    ([k, m]) => `${k} ×${m.n}${m.bytes ? ` (${f1(m.bytes / 1e6)} MB)` : ''}`,
  );
  const busy = Object.entries(r.ms).filter(([, ms]) => ms > 0);
  return [
    `${r.scenario.padEnd(6)} frames ${String(r.frames).padStart(4)}  ` +
      `p50 ${f1(r.frameP50)} p95 ${f1(r.frameP95)} max ${f1(r.frameMax)} ms  ` +
      `janky ${r.janky}  long ${r.longTasks} (${f1(r.longTaskMs)} ms)`,
    `         sent  ${sent.join('  ')}`,
    `         time  ${busy.map(([k, ms]) => `${k} ${f1(ms)} ms`).join('  ')}`,
    ...(r.actions
      ? [
          actionRow('actions', r.actions.whole),
          ...Object.entries(r.actions.byLabel).map(([label, a]) => actionRow(label, a)),
        ]
      : []),
  ];
}
