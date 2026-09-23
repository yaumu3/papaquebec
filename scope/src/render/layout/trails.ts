import type { Fix } from '../../state/track';

/** NATS-style slash spacing: wide enough that gaps in the history show. */
export const TRAIL_DECIMATION_SEC = 8;
/** The newest fixes sit under the target glyph; skip them. */
export const TRAIL_TARGET_GAP_SEC = 3;

/**
 * Fixes to draw as trail slashes, newest first: the first fix in each decimation slot of the
 * clock, so a mark stays where it was drawn and goes as a whole once its slot leaves the window.
 */
export function decimateTrail(history: readonly Fix[], now: number, windowSec: number): Fix[] {
  if (windowSec <= 0) return [];
  const cutoff = now - windowSec;
  const newest = now - TRAIL_TARGET_GAP_SEC;
  const out: Fix[] = [];
  let slot = Number.NaN;
  for (let i = history.length - 1; i >= 0; i--) {
    const f = history[i];
    if (!f || f.t > newest) continue;
    const s = Math.floor(f.t / TRAIL_DECIMATION_SEC);
    if (s === slot) out[out.length - 1] = f;
    else if (f.t < cutoff) break;
    else out.push(f);
    slot = s;
  }
  if (out.length > 0 && (out[out.length - 1]?.t ?? 0) < cutoff) out.pop();
  return out;
}
