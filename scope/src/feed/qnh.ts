import { isRecord } from '../lib/guards';
import { type MetarQnh, parseMetarQnh } from '../lib/metar';
import type { FetchLike } from './source';

/** Iowa State University's mesonet: NOAA's METAR feed relayed for every station, CORS open. */
export const IEM_CURRENTS = 'https://mesonet.agron.iastate.edu/api/1/currents.json';

/** Where METARs come from: the Iowa mirror, or NOAA's Aviation Weather Center behind a proxy. */
export type QnhSource = { kind: 'iem' } | { kind: 'awc'; base: string };

/** A `wx=<base>` query parameter names a proxy that forwards `/metar` to the Aviation Weather Center. */
export function qnhSourceFromUrl(search: string): QnhSource {
  const base = new URLSearchParams(search).get('wx');
  return base ? { kind: 'awc', base: base.replace(/\/+$/, '') } : { kind: 'iem' };
}

/** One row of the mesonet answer; rows without a usable altimeter value are dropped. */
function iemRow(raw: unknown): MetarQnh | null {
  if (!isRecord(raw)) return null;
  const { station, utc_valid: valid, alti } = raw;
  if (typeof station !== 'string' || typeof valid !== 'string' || typeof alti !== 'number') {
    return null;
  }
  const observedAt = Date.parse(valid);
  return Number.isFinite(observedAt)
    ? { station, observedAt, qnhInHg: Math.round(alti * 100) / 100 }
    : null;
}

async function fetchText(fetchFn: FetchLike, url: string, name: string): Promise<string> {
  const res = await fetchFn(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.text();
}

async function fetchIem(stations: readonly string[], fetchFn: FetchLike): Promise<MetarQnh[]> {
  const query = new URLSearchParams({ station: stations.join(',') });
  const text = await fetchText(fetchFn, `${IEM_CURRENTS}?${query}`, 'mesonet');
  const body: unknown = JSON.parse(text);
  const rows = isRecord(body) && Array.isArray(body.data) ? body.data : [];
  return rows.map(iemRow).filter((r): r is MetarQnh => r !== null);
}

async function fetchAwc(
  stations: readonly string[],
  base: string,
  fetchFn: FetchLike,
  now: Date,
): Promise<MetarQnh[]> {
  const query = new URLSearchParams({ ids: stations.join(','), format: 'raw' });
  const text = await fetchText(fetchFn, `${base}/metar?${query}`, base);
  return text
    .split('\n')
    .map((line) => parseMetarQnh(line, now))
    .filter((r): r is MetarQnh => r !== null);
}

/**
 * Fetches the stations' latest reports in one request and returns the first station, in the
 * order given, that reported; rejects on transport errors or when none did.
 */
export async function fetchQnhFrom(
  stations: readonly string[],
  source: QnhSource,
  fetchFn: FetchLike = fetch,
  now = new Date(),
): Promise<MetarQnh> {
  const reports =
    source.kind === 'iem'
      ? await fetchIem(stations, fetchFn)
      : await fetchAwc(stations, source.base, fetchFn, now);
  for (const station of stations) {
    const hit = reports.find((r) => r.station === station);
    if (hit) return hit;
  }
  throw new Error(`no METAR for ${stations.join(', ')}`);
}
