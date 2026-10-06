/** The item nearest in time to `t`, the earlier of two as near; null among none. */
export function nearestInTime<T extends { t: number }>(items: readonly T[], t: number): T | null {
  let best: T | null = null;
  for (const item of items) {
    if (!best || Math.abs(item.t - t) < Math.abs(best.t - t)) best = item;
  }
  return best;
}
