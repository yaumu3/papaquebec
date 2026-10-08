import { createSignal } from 'solid-js';

import { type GeoPoint, trueToMagnetic } from '../lib/geo';
import type { Declination } from '../lib/wmm';
import { site } from './scope';
import type { Readings } from './track';

/**
 * The declination where a bearing is measured, as the model the app loads answers it: none, so
 * true bearings, until it has.
 */
export const [declinationAt, setDeclinationAt] = createSignal<Declination>(() => 0);

/** The declination where a target is, or at the site for one without a position. */
export function declinationOf(at: GeoPoint | undefined): number {
  const where = at ?? site();
  return where ? declinationAt()(where.lat, where.lon) : 0;
}

/** Ground track in degrees magnetic, the reference every bearing on the scope reads in. */
export function magneticTrack(t: Pick<Readings, 'track' | 'at'>): number | undefined {
  return t.track === undefined ? undefined : trueToMagnetic(t.track, declinationOf(t.at));
}
