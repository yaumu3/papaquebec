/** What a recording says of each discrete action: its time to frame and the long tasks inside. */
import type { SlotName } from '../../src/render/slots';
import type { ActionMark, Recording } from './recorder';
import { pct } from './report';

/** The slots of the chart, its labels, its traces and its highlights: what an action can cause. */
export const ACTION_SLOTS: readonly SlotName[] = [
  'areaLines',
  'routeLines',
  'pointMarkers',
  'areaLabels',
  'routeLabels',
  'pointLabels',
  'traces',
  'tracedPoints',
];

export interface ActionTime {
  label: string;
  /** From the input to the first draw after the action's last chart post; null with no such post. */
  toFrame: number | null;
  /** The long tasks overlapping that window, added up. */
  longTaskMs: number;
  /** The longest of them. */
  longestMs: number;
}

const noTime = (label: string): ActionTime => ({
  label,
  toFrame: null,
  longTaskMs: 0,
  longestMs: 0,
});

function timeOf({ label, input, at }: ActionMark, until: number, r: Recording): ActionTime {
  const within = (t: number) => t >= at && t < until;
  const started = r.inputs.find((i) => i.kind === input && within(i.at))?.at;
  if (started === undefined) return noTime(label);
  const caused = ({ at: t, slot }: Recording['posts'][number]) =>
    ACTION_SLOTS.includes(slot) && t >= started && within(t);
  const lastPost = r.posts.findLast(caused)?.at;
  const frame = lastPost === undefined ? undefined : r.draws.find((t) => t >= lastPost);
  if (frame === undefined) return noTime(label);
  const tasks = r.longTasks.filter((t) => t.at < frame && t.at + t.ms > started).map((t) => t.ms);
  return {
    label,
    toFrame: frame - started,
    longTaskMs: tasks.reduce((a, b) => a + b, 0),
    longestMs: Math.max(0, ...tasks),
  };
}

/** Each action of a recording, in order: its window closes where the next action begins. */
export const actionTimes = (r: Recording): ActionTime[] =>
  r.actions.map((mark, i) => timeOf(mark, r.actions[i + 1]?.at ?? Infinity, r));

/** The p50 and max of some actions' times to frame and long tasks, with those that posted nothing apart. */
export function summaryOf(times: readonly ActionTime[]) {
  const toFrame = times.flatMap((t) => t.toFrame ?? []);
  const longTasks = times.map((t) => t.longTaskMs);
  return {
    actions: times.length,
    noPost: times.length - toFrame.length,
    toFrameP50: pct(toFrame, 50),
    toFrameMax: Math.max(0, ...toFrame),
    longTaskP50: pct(longTasks, 50),
    longTaskMax: Math.max(0, ...longTasks),
    longestMs: Math.max(0, ...times.map((t) => t.longestMs)),
  };
}

export type ActionSummary = ReturnType<typeof summaryOf>;

/** A scenario's actions summed up, and by label when it has several kinds of them. */
export function actionsOf(times: readonly ActionTime[]) {
  const labels = [...new Set(times.map((t) => t.label))];
  const byLabel =
    labels.length > 1
      ? labels.map((label) => [label, summaryOf(times.filter((t) => t.label === label))] as const)
      : [];
  return { whole: summaryOf(times), byLabel: Object.fromEntries(byLabel) };
}

export type ActionReport = ReturnType<typeof actionsOf>;
