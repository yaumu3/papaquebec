import type { Heard, HeardKey } from '../../lib/aircraft';
import { padBearing } from '../../lib/format';
import { holds, INSTRUMENT_SEC } from '../../lib/reports';
import { magneticTrack } from '../../state/magnetic';
import type { Readout } from '../../state/track';

/** The state of the instrument: oriented on the heading, on the track, or blank for want of both. */
export type NdMode = 'heading' | 'track' | 'lost' | 'blank';

export type NdFlag = 'TRK' | 'HDG';

export interface NdFrame {
  mode: NdMode;
  /** The bearing at the top of the display, magnetic. */
  orient: number;
  label: NdFlag;
  box: string;
  flags: readonly NdFlag[];
  lastHeard: string | undefined;
}

const BLANK_BOX = '---';

/**
 * When the oldest of the keys heard was heard. A key never heard does not age the value: a reading
 * is absent exactly when it was not reported, and many aircraft send a selection with no modes.
 */
export function oldestHeard(heard: Heard, keys: readonly HeardKey[]): number | undefined {
  const times = keys.flatMap((key) => heard[key] ?? []);
  return times.length === 0 ? undefined : Math.min(...times);
}

/** Whether the target's last message is `INSTRUMENT_SEC` old or older: the instrument has lost it. */
const isLost = (t: Pick<Readout, 'seen'>): boolean => t.seen >= INSTRUMENT_SEC;

/** The mode the instrument is in: the heading while it holds, else the magnetic track while it holds. */
function modeOf(t: Readout, now: number): NdMode {
  if (isLost(t)) return 'lost';
  if (holds(t.heard.heading, now, INSTRUMENT_SEC) && t.heading !== undefined) return 'heading';
  if (holds(t.heard.track, now, INSTRUMENT_SEC) && magneticTrack(t) !== undefined) return 'track';
  return 'blank';
}

/** The bearing the display is oriented on: the last heading, else the last track, whatever their age. */
function orientOf(t: Readout, mode: NdMode): number {
  if (mode === 'track') return magneticTrack(t) ?? 0;
  return t.heading ?? magneticTrack(t) ?? 0;
}

const FLAGS: Record<NdMode, readonly NdFlag[]> = {
  heading: [],
  track: ['HDG'],
  lost: ['TRK', 'HDG'],
  blank: ['TRK', 'HDG'],
};

/** What the top of the ND reads, and the flags beside it, from the freshness of the target's readings. */
export function ndFrame(t: Readout, now: number): NdFrame {
  const mode = modeOf(t, now);
  const orient = orientOf(t, mode);
  const live = mode === 'heading' || mode === 'track';
  return {
    mode,
    orient,
    label: mode !== 'track' && t.heading !== undefined ? 'HDG' : 'TRK',
    box: live ? padBearing(orient) : BLANK_BOX,
    flags: FLAGS[mode],
    lastHeard: mode === 'lost' ? `LAST HEARD ${Math.round(t.seen)} s` : undefined,
  };
}
