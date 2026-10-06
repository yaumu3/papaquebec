/** The item nearest in time to `t`, the earlier of two as near; null among none. */
export function nearestInTime<T extends { t: number }>(items: readonly T[], t: number): T | null {
  let best: T | null = null;
  for (const item of items) {
    const nearer =
      !best ||
      Math.abs(item.t - t) < Math.abs(best.t - t) ||
      (Math.abs(item.t - t) === Math.abs(best.t - t) && item.t < best.t);
    if (nearer) best = item;
  }
  return best;
}
