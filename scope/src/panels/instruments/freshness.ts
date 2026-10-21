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

/** Whether the target's last message is `LAPSE_SEC` old or older: the instrument has lost it. */
export const isLost = (t: Pick<Readout, 'seen'>): boolean => t.seen >= LAPSE_SEC;
