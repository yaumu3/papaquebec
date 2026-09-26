import { createSignal } from 'solid-js';

import { trueToMagnetic } from '../lib/geo';
import type { Track } from './track';

/** Magnetic declination at the site, degrees east positive. */
export const [declination, setDeclination] = createSignal(0);

/** Ground track in degrees magnetic, the reference every bearing on the scope reads in. */
export function magneticTrack(t: Pick<Track, 'track'>): number | undefined {
  return t.track === undefined ? undefined : trueToMagnetic(t.track, declination());
}
