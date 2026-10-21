import type { HeardKey } from '../../lib/aircraft';
import { oldestHeard, withinLapse } from '../../lib/reports';
import type { ReadingKey } from '../../state/plotted';
import type { Sample } from '../../state/track';
import { HEARD } from '../readings';

/** Whether the reading made of `keys` was heard less than the gap from `t`; always, without keys. */
export function heardNear(s: Sample, keys: readonly HeardKey[], t: number): boolean {
  if (keys.length === 0) return true;
  const at = oldestHeard(s.heard, keys);
  return at !== undefined && withinLapse(t, at);
}

/**
 * The sample less each reading of the lane of `keys` not heard within the gap of `t`: the track and
 * the heading each on its own, the values of any other reading together.
 */
export function heardNearAt(keys: readonly ReadingKey[], s: Sample, t = s.t): Sample {
  const out = { ...s };
  for (const key of keys) {
    const parts = key === 'trk' ? HEARD.trk.map((value) => [value]) : [HEARD[key]];
    for (const part of parts) {
      if (heardNear(s, part, t)) continue;
      for (const value of part) Object.assign(out, { [value]: undefined });
    }
  }
  return out;
}
