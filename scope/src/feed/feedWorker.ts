/// <reference lib="webworker" />
import type { AircraftSnapshot, ReceiverPosition } from '../lib/aircraft';
import type { FeedMessage } from './decode';
import { type FeedDown, followFeed, openWebTransport } from './push';

export type FeedCommand = {
  type: 'start';
  /** Where the feeder publishes how to reach it. */
  feedInfo: string;
};

export type FeedEvent =
  | { type: 'receiver'; receiver: ReceiverPosition }
  /** The history a session brings, in time order, before its first snapshot. */
  | { type: 'backfill'; snapshots: AircraftSnapshot[] }
  | { type: 'snapshot'; snapshot: AircraftSnapshot; receivedAt: number }
  | { type: 'down'; reason: FeedDown };

const RETRY_MS = 2000;
/** Ten of the feed's one-second snapshots. */
const DEADLINE_MS = 10_000;
const post = (e: FeedEvent) => self.postMessage(e);
const down = (reason: FeedDown) => post({ type: 'down', reason });

function run(cmd: FeedCommand): void {
  if (typeof WebTransport !== 'function') return down({ kind: 'unsupported' });
  /** The last snapshot taken; a session resumes after it, so what comes is newer. */
  let lastNow = 0;
  const take = (message: FeedMessage) => {
    if (message.kind === 'hello') {
      post({ type: 'receiver', receiver: message.receiver });
      if (message.history.length > 0) post({ type: 'backfill', snapshots: message.history });
      // The history stops short of the latest snapshot, which follows in full.
      lastNow = Math.max(lastNow, message.history.at(-1)?.now ?? 0);
      return;
    }
    // A new session starts with the latest snapshot, which may be the last one taken.
    if (message.snapshot.now <= lastNow) return;
    lastNow = message.snapshot.now;
    post({ type: 'snapshot', snapshot: message.snapshot, receivedAt: Date.now() });
  };
  followFeed({
    infoUrl: cmd.feedInfo,
    host: self.location.hostname,
    fetchFn: fetch,
    open: openWebTransport,
    onMessage: take,
    onDown: down,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    retryMs: RETRY_MS,
    deadlineMs: DEADLINE_MS,
    since: () => lastNow,
  });
}

self.addEventListener('message', (e: MessageEvent<FeedCommand>) => {
  if (e.data.type === 'start') run(e.data);
});
