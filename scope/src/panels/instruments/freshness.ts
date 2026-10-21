import type { HeardKey } from '../../lib/aircraft';
import { holds, LAPSE_SEC, oldestHeard } from '../../lib/reports';
import type { Readout } from '../../state/track';

/** Whether a value read from these keys still holds at `instant`: it is as old as the oldest of them. */
export const holdsAll = (
  t: Pick<Readout, 'heard'>,
  keys: readonly HeardKey[],
  instant: number,
): boolean => holds(oldestHeard(t.heard, keys), instant, LAPSE_SEC);

/** The value `v` read from these keys while they hold at `instant`, else none. */
export const ifHolds = <V>(
  t: Pick<Readout, 'heard'>,
  keys: readonly HeardKey[],
  instant: number,
  v: V,
): V | undefined => (holdsAll(t, keys, instant) ? v : undefined);

/**
 * Whether every one of the keys holds on its own. Unlike `holdsAll`, which ages a value by the
 * oldest key heard, a key never heard does not hold.
 */
export const eachHolds = (
  t: Pick<Readout, 'heard'>,
  keys: readonly HeardKey[],
  instant: number,
): boolean => keys.every((key) => holdsAll(t, [key], instant));

/** Whether the target's last message is `LAPSE_SEC` old or older: the instrument has lost it. */
export const isLost = (t: Pick<Readout, 'seen'>): boolean => t.seen >= LAPSE_SEC;
