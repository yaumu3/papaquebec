import type { AircraftSnapshot, ReceiverJson } from '../lib/aircraft';
import { parseReceiver, parseSnapshot } from './parse';
import type { FeedSource, FetchLike } from './source';

export async function getJson(fetchFn: FetchLike, url: string): Promise<unknown> {
  const res = await fetchFn(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

/** Polls readsb's `aircraft.json` as served by the tar1090 image under `/data/`. */
export function createReadsbSource(base = '/data', fetchFn: FetchLike = fetch): FeedSource {
  return {
    poll: async (): Promise<AircraftSnapshot> =>
      parseSnapshot(await getJson(fetchFn, `${base}/aircraft.json`)),
    receiver: async (): Promise<ReceiverJson> =>
      parseReceiver(await getJson(fetchFn, `${base}/receiver.json`)),
  };
}
