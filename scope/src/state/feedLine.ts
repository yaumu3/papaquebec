/** How the top bar and the banner tell the feed's state: by the age of its data. */
import type { FeedDown, Wait } from '../feed/push';
import type { FeedStatus } from './scope';

export const STALE_AFTER_MS = 5000;
/** Long enough for several attempts to connect again. */
export const DEAD_AFTER_MS = 30_000;

export type FeedState = 'rx' | 'waiting' | 'dead';

/**
 * Receiving while the last snapshot is recent; dead once nothing has come for a
 * while since the page was last shown, as the time it spent hidden is not the
 * feed's fault; waiting in between.
 */
export function feedState(status: FeedStatus, now: number): FeedState {
  if (status.lastAt !== null && now - status.lastAt <= STALE_AFTER_MS) return 'rx';
  const quiet = now - Math.max(status.lastAt ?? -Infinity, status.shownAt);
  return quiet < DEAD_AFTER_MS ? 'waiting' : 'dead';
}

const MISSING: Record<Wait, string> = {
  info: 'no feed info',
  connecting: 'not connected',
  stream: 'no stream',
  frame: 'no frame',
};

const PLAIN: Record<Exclude<FeedDown['kind'], 'late' | 'failed'>, string> = {
  ended: 'the feeder ended the session',
  unsupported: 'this browser has no WebTransport',
};

export function describeDown(reason: FeedDown): string {
  if (reason.kind === 'late') return `${MISSING[reason.wait]} in ${reason.ms / 1000} s`;
  if (reason.kind === 'failed') return reason.message;
  return PLAIN[reason.kind];
}

/** Why a dead feed is dead, in words. */
export function deadReason(status: FeedStatus): string {
  return status.reason ? describeDown(status.reason) : 'no data';
}

export interface Notice {
  cls: 'warn' | 'err';
  text: string;
}

/** Null while receiving, so the track count and message rate can show instead. */
export function feedNotice(status: FeedStatus, now: number): Notice | null {
  const state = feedState(status, now);
  if (state === 'rx') return null;
  if (state === 'dead') return { cls: 'err', text: `DEAD · ${deadReason(status)}` };
  return status.lastAt === null
    ? { cls: 'warn', text: 'CONNECTING' }
    : { cls: 'warn', text: `STALE ${Math.round((now - status.lastAt) / 1000)}s` };
}
