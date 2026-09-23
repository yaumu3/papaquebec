/**
 * The receiver position for the build scripts: given on the command line, else `PQ_SITE`
 * (`lat,lon`), else read from the tar1090 at `PQ_TAR1090`.
 */
import type { Site } from './countries';
import { isRecord } from './guards';

export type FetchLike = (url: string) => Promise<Response>;
export type Env = Record<string, string | undefined>;

function parseSite(lat: string, lon: string): Site {
  const site = { lat: Number(lat), lon: Number(lon) };
  if (Number.isFinite(site.lat) && Number.isFinite(site.lon)) return site;
  throw new Error(`not a position: ${lat} ${lon}`);
}

export async function resolveSite(
  args: readonly string[],
  env: Env,
  fetchFn: FetchLike = fetch,
): Promise<Site> {
  const [latArg, lonArg] = args;
  if (latArg !== undefined && lonArg !== undefined) return parseSite(latArg, lonArg);
  if (env.PQ_SITE) {
    const [lat = '', lon = ''] = env.PQ_SITE.split(',');
    return parseSite(lat, lon);
  }
  if (!env.PQ_TAR1090)
    throw new Error('no site: set PQ_TAR1090 to the tar1090 URL or PQ_SITE to lat,lon');
  const url = `${env.PQ_TAR1090}/data/receiver.json`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const body: unknown = await res.json();
  if (isRecord(body) && typeof body.lat === 'number' && typeof body.lon === 'number') {
    return { lat: body.lat, lon: body.lon };
  }
  throw new Error(`no site: ${url} reports no position; set PQ_SITE to lat,lon`);
}
