import type { Readout, Track } from '../../state/track';

/** What the instruments draw: a target's readings and the instant their freshness is judged at. */
export interface Moment<R extends Readout = Track> {
  kind: 'now';
  r: R;
  instant: number;
}

/** The target as it is `now`. */
export const nowAt = <R extends Readout>(r: R, now: number): Moment<R> => ({
  kind: 'now',
  r,
  instant: now,
});
