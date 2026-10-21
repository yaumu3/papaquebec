/**
 * How long a transponder sends the special position identification after the crew presses
 * IDENT (ICAO Annex 10 Volume IV): the ident is shown while its report is this fresh.
 */
export const IDENT_SEC = 18;

/**
 * How long an aircraft keeps reporting a resolution advisory once it has ended (ICAO Annex 10
 * Volume IV, RTCA DO-260B): one not reported for this long is over.
 */
export const ADVISORY_SEC = 18;

/**
 * How long an emergency/priority status holds after it was last heard. A transponder broadcasts a
 * set status every 0.7 to 0.9 s (RTCA DO-260B), or every 2.4 to 2.6 s from one of version 1 that
 * also broadcasts its target state (RTCA DO-260A §A.1.4.8.1), and stops once it is cleared: four
 * of the longer intervals, so that a few broadcasts lost do not clear it.
 */
export const EMERGENCY_SEC = 10;

/**
 * How long a report holds after it was last heard, for the scope, the lanes and the instruments
 * alike. An SSR scans an en-route sector every 10 to 12 s and the Comm-B registers are read once a
 * scan at best, so a value read only every other scan must not blink out between two. A value this
 * old has lapsed, a position this old is stale, a target unheard this long is lost, and samples this
 * far apart leave a gap.
 */
export const LAPSE_SEC = 30;

/** Whether a report heard at `heardAt` still holds at `now`: heard less than `lapseSec` before. */
export function holds(heardAt: number | undefined, now: number, lapseSec: number): boolean {
  return heardAt !== undefined && now - heardAt < lapseSec;
}
