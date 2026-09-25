import type { AircraftSnapshot } from '../lib/aircraft';
import { chunkToSnapshots, parseChunkIndex } from '../lib/chunks';
import { HISTORY_RETENTION_SEC } from '../state/trackStore';
import { getJson } from './readsb';
import type { FetchLike } from './source';

/** Backfill a little beyond the retention window so the oldest slot is complete. */
const BACKFILL_SLACK_SEC = 60;
/** Two of tar1090's 8 s history frames: a shorter hole has nothing to replay. */
const SUSPEND_GAP_MS = 16_000;

/**
 * tar1090's last hour of 8 s snapshots, trimmed to what the store would keep
 * anyway and to frames newer than `after`.
 */
export async function loadChunkHistory(
  fetchFn: FetchLike,
  base: string,
  after = 0,
): Promise<AircraftSnapshot[]> {
  const files = parseChunkIndex(await getJson(fetchFn, `${base}/chunks.json`));
  const chunks = await Promise.all(
    files.map((f) => getJson(fetchFn, `${base}/${f}`).then(chunkToSnapshots, () => [])),
  );
  const frames = chunks.flat().toSorted((a, b) => a.now - b.now);
  const latest = frames.at(-1)?.now ?? 0;
  const oldest = latest - HISTORY_RETENTION_SEC - BACKFILL_SLACK_SEC;
  return frames.filter((f) => f.now >= oldest && f.now > after);
}

/** A poll this long after the last one means the timer was frozen, as in a backgrounded iOS web app. */
export function wasSuspended(lastPolledAt: number, now: number): boolean {
  return now - lastPolledAt > SUSPEND_GAP_MS;
}
