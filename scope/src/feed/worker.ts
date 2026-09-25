/// <reference lib="webworker" />
import type { AircraftSnapshot, ReceiverJson } from '../lib/aircraft';
import { loadChunkHistory } from './history';
import { createReadsbSource } from './readsb';
import type { FeedSource } from './source';

export type FeedCommand = {
  type: 'start';
  base: string;
  /** Where tar1090 keeps its track history chunks. */
  historyBase: string;
};

export type FeedEvent =
  | { type: 'receiver'; receiver: ReceiverJson }
  /** tar1090 history replayed in time order before live polling starts. */
  | { type: 'backfill'; snapshots: AircraftSnapshot[] }
  | { type: 'snapshot'; snapshot: AircraftSnapshot; receivedAt: number }
  | { type: 'error'; message: string; at: number };

const MIN_INTERVAL_MS = 500;
const post = (e: FeedEvent) => self.postMessage(e);

async function run(cmd: FeedCommand): Promise<void> {
  const source: FeedSource = createReadsbSource(cmd.base);
  let interval = 1000;
  try {
    const receiver = await source.receiver();
    interval = Math.max(MIN_INTERVAL_MS, receiver.refresh ?? 1000);
    post({ type: 'receiver', receiver });
    const snapshots = await loadChunkHistory(fetch, cmd.historyBase).catch(() => []);
    if (snapshots.length > 0) post({ type: 'backfill', snapshots });
  } catch (err) {
    post({ type: 'error', message: `receiver.json: ${String(err)}`, at: Date.now() });
  }
  const tick = async () => {
    const started = Date.now();
    try {
      const snapshot = await source.poll();
      post({ type: 'snapshot', snapshot, receivedAt: Date.now() });
    } catch (err) {
      post({ type: 'error', message: String(err), at: Date.now() });
    }
    const elapsed = Date.now() - started;
    setTimeout(() => void tick(), Math.max(0, interval - elapsed));
  };
  void tick();
}

self.addEventListener('message', (e: MessageEvent<FeedCommand>) => {
  if (e.data.type === 'start') void run(e.data);
});
