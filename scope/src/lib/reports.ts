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

/** Whether a report heard at `heardAt` still holds at `now`: heard less than `lapseSec` before. */
export function holds(heardAt: number | undefined, now: number, lapseSec: number): boolean {
  return heardAt !== undefined && now - heardAt < lapseSec;
}
