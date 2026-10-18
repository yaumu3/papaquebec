import type { Heard, HeardKey } from '../../lib/aircraft';
import { holds, INSTRUMENT_SEC } from '../../lib/reports';
import type { Readout } from '../../state/track';

/**
 * When the oldest of the keys heard was heard. A key never heard does not age the value: a reading
 * is absent exactly when it was not reported, and many aircraft send a selection with no modes.
 */
export function oldestHeard(heard: Heard, keys: readonly HeardKey[]): number | undefined {
  const times = keys.flatMap((key) => heard[key] ?? []);
  return times.length === 0 ? undefined : Math.min(...times);
}

/** Whether a value read from these keys still holds: it is as old as the oldest of them. */
export const holdsAll = (
  t: Pick<Readout, 'heard'>,
  keys: readonly HeardKey[],
  now: number,
): boolean => holds(oldestHeard(t.heard, keys), now, INSTRUMENT_SEC);

/** Whether the target's last message is `INSTRUMENT_SEC` old or older: the instrument has lost it. */
export const isLost = (t: Pick<Readout, 'seen'>): boolean => t.seen >= INSTRUMENT_SEC;
