import type { Readout, Sample, Track } from '../../state/track';
import { isLost } from './freshness';

/** The target as it is now. */
export interface Now<R extends Readout = Track> {
  kind: 'now';
  r: R;
  /** When freshness is judged: the snapshot's time. */
  instant: number;
}

/** A sample drawn at its own time: the peeked one, or the newest in a held window. */
export interface Then {
  kind: 'sample';
  r: Sample;
  instant: number;
}

/** What the instruments draw: the target now, a sample while peeking or held, or nothing where the lanes read none. */
export type Moment<R extends Readout = Track> = Now<R> | Then | { kind: 'empty' };

/** The target as it is `now`. */
export const nowAt = <R extends Readout>(r: R, now: number): Now<R> => ({
  kind: 'now',
  r,
  instant: now,
});

/** What the target draws: now unless the panel reads the past; then the sample the lanes read, at its own time, or nothing without one. */
export function momentOf(t: Track, past: boolean, at: Sample | null, now: number): Moment {
  if (!past) return nowAt(t, now);
  return at ? { kind: 'sample', r: at, instant: at.t } : { kind: 'empty' };
}

/** Which moment is drawn, apart from its values: the same for every update of now, one per sample. */
export const momentKey = (m: Moment<Readout>): string =>
  m.kind === 'now' ? 'now' : m.kind === 'sample' ? String(m.r.t) : 'empty';

/** Whether the instrument has lost the target at this moment; the empty moment shows no target to lose. */
export const lostAt = (m: Moment<Readout>): boolean => m.kind !== 'empty' && isLost(m.r);
