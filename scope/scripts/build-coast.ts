/**
 * Coastline around the site from Natural Earth's 10 m coastline (public domain), clipped to a
 * box and written as `public/map/coast.json`: `{ site, radiusNm, lines: [[[lon, lat], ...], ...] }`.
 * Runs before every build and is a no-op while the file already covers the same site.
 *
 *   bun scripts/build-coast.ts [lat lon] [radiusNm=300] [ne_10m_coastline.geojson]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { isRecord } from './guards';
import { resolveSite } from './site';

const NE_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_coastline.geojson';
const OUT = 'public/map/coast.json';

type LonLat = [number, number];

const isLonLat = (v: unknown): v is LonLat =>
  Array.isArray(v) && v.length >= 2 && typeof v[0] === 'number' && typeof v[1] === 'number';
const isLine = (v: unknown): v is LonLat[] => Array.isArray(v) && v.every(isLonLat);

const [, , ...args] = process.argv;
const positional = args.length >= 2 && !args[0]?.endsWith('.geojson') ? args.slice(0, 2) : [];
const radiusNm = Number(args[positional.length] ?? 300);
const input = args.find((a) => a.endsWith('.geojson'));

const site = await resolveSite(positional, process.env);
if (existsSync(OUT)) {
  const existing: unknown = JSON.parse(readFileSync(OUT, 'utf8'));
  const prev = isRecord(existing) && isRecord(existing.site) ? existing : null;
  const same =
    prev &&
    isRecord(prev.site) &&
    typeof prev.site.lat === 'number' &&
    typeof prev.site.lon === 'number' &&
    Math.abs(prev.site.lat - site.lat) < 0.01 &&
    Math.abs(prev.site.lon - site.lon) < 0.01 &&
    prev.radiusNm === radiusNm;
  if (same) {
    console.log(`${OUT} already covers ${site.lat}, ${site.lon}`);
    process.exit(0);
  }
}

const dLat = radiusNm / 60;
const dLon = dLat / Math.cos((site.lat * Math.PI) / 180);
const inside = ([x, y]: LonLat) => Math.abs(y - site.lat) <= dLat && Math.abs(x - site.lon) <= dLon;

const text = input ? readFileSync(input, 'utf8') : await (await fetch(NE_URL)).text();
const geo: unknown = JSON.parse(text);
const features = isRecord(geo) && Array.isArray(geo.features) ? geo.features : [];

/** Runs of consecutive in-box points; a line leaving the box is split. */
function clip(line: LonLat[]): LonLat[][] {
  const out: LonLat[][] = [];
  let run: LonLat[] = [];
  for (const p of line) {
    if (inside(p)) run.push([Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4]);
    else if (run.length > 1) {
      out.push(run);
      run = [];
    } else run = [];
  }
  if (run.length > 1) out.push(run);
  return out;
}

const lines: LonLat[][] = [];
for (const f of features) {
  const g = isRecord(f) && isRecord(f.geometry) ? f.geometry : null;
  if (!g) continue;
  const parts: LonLat[][] =
    g.type === 'LineString' && isLine(g.coordinates)
      ? [g.coordinates]
      : g.type === 'MultiLineString' && Array.isArray(g.coordinates)
        ? g.coordinates.filter(isLine)
        : [];
  for (const part of parts) lines.push(...clip(part));
}
writeFileSync(OUT, JSON.stringify({ site, radiusNm, lines }));
console.log(
  `${lines.length} coastline segments within ${radiusNm} NM of ${site.lat}, ${site.lon} -> ${OUT}`,
);
