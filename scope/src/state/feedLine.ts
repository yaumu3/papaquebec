/** The feed status as the top bar words it, and the rule that ages a receiving feed into stale. */
import type { FeedStatus } from './scope';

export const STALE_AFTER_MS = 5000;

/** A receiving feed that has been quiet for the window turns stale; every other state stands. */
export function markStale(current: FeedStatus, now: number): FeedStatus {
  return current.kind === 'rx' && now - current.lastAt > STALE_AFTER_MS
    ? { kind: 'stale', lastAt: current.lastAt }
    : current;
}

export interface Notice {
  cls: 'warn' | 'err';
  text: string;
}

/** Null while receiving, so the track count and message rate can show instead. */
export function feedNotice(status: FeedStatus, now: number): Notice | null {
  switch (status.kind) {
    case 'rx':
      return null;
    case 'stale':
      return { cls: 'warn', text: `STALE ${Math.round((now - status.lastAt) / 1000)}s` };
    case 'dead':
      return { cls: 'err', text: `DEAD · ${status.message}` };
    default:
      return { cls: 'warn', text: 'CONNECTING' };
  }
}
