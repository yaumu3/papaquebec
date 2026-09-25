import type { AircraftSnapshot } from '../lib/aircraft';
import { chunkToSnapshots, parseChunkIndex } from '../lib/chunks';
import { HISTORY_RETENTION_SEC } from '../state/trackStore';
import { getJson } from './readsb';
import type { FetchLike } from './source';

/** Backfill a little beyond the retention window so the oldest slot is complete. */
const BACKFILL_SLACK_SEC = 60;

/** tar1090's last hour of 8 s snapshots, trimmed to what the store would keep anyway. */
export async function loadChunkHistory(
  fetchFn: FetchLike,
  base: string,
): Promise<AircraftSnapshot[]> {
  const files = parseChunkIndex(await getJson(fetchFn, `${base}/chunks.json`));
  const chunks = await Promise.all(
    files.map((f) => getJson(fetchFn, `${base}/${f}`).then(chunkToSnapshots, () => [])),
  );
  const frames = chunks.flat().toSorted((a, b) => a.now - b.now);
  const latest = frames.at(-1)?.now ?? 0;
  return frames.filter((f) => f.now >= latest - HISTORY_RETENTION_SEC - BACKFILL_SLACK_SEC);
}
