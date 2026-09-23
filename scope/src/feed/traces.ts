import { parseTrace, type Trace } from '../lib/trace';
import { getJson } from './readsb';
import type { FetchLike } from './source';

/** readsb keeps today's trace per aircraft under the last two hex digits. */
function traceUrl(base: string, hex: string): string {
  const h = hex.toLowerCase();
  return `${base}/traces/${h.slice(-2)}/trace_full_${h}.json`;
}

/** The full-day trace for a hex, or null when readsb is not writing traces. */
export async function fetchTrace(
  base: string,
  hex: string,
  fetchFn: FetchLike = fetch,
): Promise<Trace | null> {
  try {
    return parseTrace(await getJson(fetchFn, traceUrl(base, hex)));
  } catch {
    return null;
  }
}
