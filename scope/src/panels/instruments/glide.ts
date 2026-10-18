import { clamp } from '../../lib/math';

/**
 * How long a shown reading takes to reach a new report, ms: the feed publishes every second, so
 * a reading on the move arrives as the next report comes in and the instrument runs without a
 * pause.
 */
export const GLIDE_MS = 1000;

/** A reading on its way from the value it showed to the one reported. */
export interface Glide {
  from: number;
  to: number;
  /** Milliseconds, on the clock the frames are drawn by. */
  startedAt: number;
}

/** How far `to` lies from `from` the short way round a circle of `wrap`. */
const shortWay = (from: number, to: number, wrap: number): number =>
  ((((to - from) % wrap) + 1.5 * wrap) % wrap) - wrap / 2;

const onCircle = (v: number, wrap: number): number => ((v % wrap) + wrap) % wrap;

/**
 * Where a glide stands at `now`: from its start to its end at one pace, there after `GLIDE_MS`.
 * An angle takes the short way round the circle of `wrap` and stays on it.
 */
export function glideAt(g: Glide, now: number, wrap?: number): number {
  const k = clamp((now - g.startedAt) / GLIDE_MS, 0, 1);
  if (wrap === undefined) return g.from + (g.to - g.from) * k;
  return onCircle(g.from + shortWay(g.from, g.to, wrap) * k, wrap);
}

/**
 * The glide toward `to` begun at `now`: `current` itself while it already heads there, else from
 * where it stands. A value with none shown before it stands at once.
 */
function glideToward(current: Glide | undefined, to: number, now: number, wrap?: number): Glide {
  if (current === undefined) return { from: to, to, startedAt: now };
  if (current.to === to) return current;
  return { from: glideAt(current, now, wrap), to, startedAt: now };
}

/** The glide toward `to`, or none while there is nothing to show. */
export const retargetGlide = (
  current: Glide | undefined,
  to: number | undefined,
  now: number,
  wrap?: number,
): Glide | undefined => (to === undefined ? undefined : glideToward(current, to, now, wrap));

/** A point on the display, in pixels. */
export type Point = readonly [number, number];

/** The glides of a point's two coordinates. */
export type PointGlides = readonly [Glide, Glide];

/**
 * The glides of each key toward its point, begun at `now`: a key keeps its glides while they
 * already head for its point, a new key stands at once, and a key with no point is dropped.
 */
export function retargetPoints(
  current: ReadonlyMap<string, PointGlides>,
  targets: ReadonlyMap<string, Point>,
  now: number,
): Map<string, PointGlides> {
  const next = new Map<string, PointGlides>();
  for (const [key, [x, y]] of targets) {
    const was = current.get(key);
    const glides: PointGlides = [glideToward(was?.[0], x, now), glideToward(was?.[1], y, now)];
    next.set(key, was && glides[0] === was[0] && glides[1] === was[1] ? was : glides);
  }
  return next;
}
