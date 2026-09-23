/// <reference lib="webworker" />
import type { AircraftSnapshot, ReceiverJson } from '../lib/aircraft';
import { chunkToSnapshots, parseChunkIndex } from '../lib/chunks';
import { HISTORY_RETENTION_SEC } from '../state/trackStore';
import { createReadsbSource } from './readsb';
import { getJson } from './readsb';
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
/** Backfill a little beyond the retention window so the oldest slot is complete. */
const BACKFILL_SLACK_SEC = 60;
const post = (e: FeedEvent) => self.postMessage(e);

/** tar1090's last hour of 8 s snapshots, trimmed to what the store would keep anyway. */
async function loadChunkHistory(base: string): Promise<AircraftSnapshot[]> {
  const files = parseChunkIndex(await getJson(fetch, `${base}/chunks.json`));
  const chunks = await Promise.all(
    files.map((f) => getJson(fetch, `${base}/${f}`).then(chunkToSnapshots, () => [])),
  );
  const frames = chunks.flat().toSorted((a, b) => a.now - b.now);
  const latest = frames.at(-1)?.now ?? 0;
  return frames.filter((f) => f.now >= latest - HISTORY_RETENTION_SEC - BACKFILL_SLACK_SEC);
}

async function run(cmd: FeedCommand): Promise<void> {
  const source: FeedSource = createReadsbSource(cmd.base);
  let interval = 1000;
  try {
    const receiver = await source.receiver();
    interval = Math.max(MIN_INTERVAL_MS, receiver.refresh ?? 1000);
    post({ type: 'receiver', receiver });
    const snapshots = await loadChunkHistory(cmd.historyBase).catch(() => []);
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
