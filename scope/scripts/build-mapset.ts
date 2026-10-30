/**
 * Current aeronautical data around the site from openAIP's daily exports
 * (https://storage.openaip.net/openaip-system-exports/, anonymous, CC BY-NC-SA 4.0):
 * every country whose territory lies within the radius, written as the built-in map set to
 * `public/map/openaip.mapset.geojson`.
 * Runs before every build; when the exports cannot be reached, an existing file is kept.
 *
 *   bun scripts/build-mapset.ts [lat lon] [radiusNm=150]      site from PQ_SITE
 */
import { existsSync, writeFileSync } from 'node:fs';

import { countriesNear } from './countries';
import table from './countries.json';
import { toMapSet } from './openaip';
import { resolveSite } from './site';

const EXPORTS = 'https://storage.openaip.net/openaip-system-exports';
const OUT = 'public/map/openaip.mapset.geojson';

const [, , ...args] = process.argv;
const positional = args.length >= 2 ? args.slice(0, 2) : [];
const radiusNm = Number(args[positional.length] ?? 150);

/** One export file: a JSON array of records. Missing files (a dataset the country lacks) are empty. */
async function fetchExport(country: string, kind: string): Promise<unknown[]> {
  const res = await fetch(`${EXPORTS}/${country.toLowerCase()}_${kind}.json`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`${country} ${kind}: HTTP ${res.status}`);
  const body: unknown = await res.json();
  if (!Array.isArray(body)) throw new Error(`${country} ${kind}: expected a JSON array`);
  return body;
}

try {
  const site = resolveSite(positional, process.env);
  const countries = countriesNear(site, radiusNm, table);
  console.log(`site ${site.lat}, ${site.lon}; ${radiusNm} NM covers ${countries.join(', ')}`);
  const KINDS = ['asp', 'nav', 'apt', 'rpp'] as const;
  const perCountry = await Promise.all(
    countries.map(async (country) => {
      const [asp, nav, apt, rpp] = await Promise.all(KINDS.map((k) => fetchExport(country, k)));
      console.log(
        `${country}: ${asp?.length} airspaces, ${nav?.length} navaids, ${apt?.length} airports, ${rpp?.length} reporting points`,
      );
      return { asp: asp ?? [], nav: nav ?? [], apt: apt ?? [], rpp: rpp ?? [] };
    }),
  );
  const input = {
    airspaces: perCountry.flatMap((c) => c.asp),
    navaids: perCountry.flatMap((c) => c.nav),
    airports: perCountry.flatMap((c) => c.apt),
    reportingPoints: perCountry.flatMap((c) => c.rpp),
  };
  const fetched = new Date().toISOString().slice(0, 10);
  const set = toMapSet(input, { site, radiusNm, countries, fetched });
  writeFileSync(OUT, JSON.stringify(set, null, 1));
  console.log(`${set.features.length} features -> ${OUT}`);
} catch (err) {
  console.warn(`map data not refreshed: ${err instanceof Error ? err.message : String(err)}`);
  if (!existsSync(OUT)) {
    console.warn(`no ${OUT} either; the scope will draw no aeronautical data`);
    process.exit(1);
  }
}
