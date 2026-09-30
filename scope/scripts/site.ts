/**
 * The receiver position for the build scripts: given on the command line, else `PQ_SITE`
 * (`lat,lon`).
 */
import type { Site } from './countries';

export type Env = Record<string, string | undefined>;

function parseSite(lat: string, lon: string): Site {
  const site = { lat: Number(lat), lon: Number(lon) };
  // An empty string would count as zero.
  const written = lat.trim() !== '' && lon.trim() !== '';
  if (written && Number.isFinite(site.lat) && Number.isFinite(site.lon)) return site;
  throw new Error(`not a position: ${lat} ${lon}`);
}

export function resolveSite(args: readonly string[], env: Env): Site {
  const [latArg, lonArg] = args;
  if (latArg !== undefined && lonArg !== undefined) return parseSite(latArg, lonArg);
  if (!env.PQ_SITE) throw new Error('no site: set PQ_SITE to lat,lon');
  const [lat = '', lon = ''] = env.PQ_SITE.split(',');
  return parseSite(lat, lon);
}
