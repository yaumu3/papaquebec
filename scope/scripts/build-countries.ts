/**
 * Bounding boxes of every country polygon, keyed by ISO 3166-1 alpha-2, from Natural Earth's
 * 10 m admin-0 countries (public domain). Vendored as `scripts/countries.json` so the aero
 * build can pick which openAIP country exports cover the site without a geometry library.
 *
 *   bun scripts/build-countries.ts [ne_10m_admin_0_countries.geojson]
 */
import { writeFileSync } from 'node:fs';

import { isRecord } from './guards';

const NE_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson';
const OUT = 'scripts/countries.json';

type Box = [number, number, number, number];
type Ring = [number, number][];

const isRing = (v: unknown): v is Ring =>
  Array.isArray(v) && v.every((p) => Array.isArray(p) && typeof p[0] === 'number');
/** Outer rings of a Polygon or MultiPolygon geometry. */
function outerRings(g: Record<string, unknown>): Ring[] {
  const c = g.coordinates;
  if (g.type === 'Polygon' && Array.isArray(c)) return [c[0]].filter(isRing);
  if (g.type === 'MultiPolygon' && Array.isArray(c)) {
    return c.map((poly: unknown) => (Array.isArray(poly) ? poly[0] : null)).filter(isRing);
  }
  return [];
}

const [, , input] = process.argv;
const text = input ? await Bun.file(input).text() : await (await fetch(NE_URL)).text();
const geo: unknown = JSON.parse(text);
const features = isRecord(geo) && Array.isArray(geo.features) ? geo.features : [];

const round = (v: number, up: boolean) => (up ? Math.ceil(v * 100) : Math.floor(v * 100)) / 100;

/** The box of one polygon's outer ring, widened to hundredths of a degree. */
function boxOf(ring: Ring): Box {
  let [minLon, minLat, maxLon, maxLat] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lon, lat] of ring) {
    minLon = Math.min(minLon, lon);
    minLat = Math.min(minLat, lat);
    maxLon = Math.max(maxLon, lon);
    maxLat = Math.max(maxLat, lat);
  }
  return [round(minLon, false), round(minLat, false), round(maxLon, true), round(maxLat, true)];
}

const table: Record<string, Box[]> = {};
for (const f of features) {
  if (!isRecord(f) || !isRecord(f.properties) || !isRecord(f.geometry)) continue;
  const eh = f.properties.ISO_A2_EH;
  const a2 = f.properties.ISO_A2;
  const code = typeof eh === 'string' && eh !== '-99' ? eh : typeof a2 === 'string' ? a2 : '-99';
  if (code === '-99') continue;
  const boxes = (table[code] ??= []);
  for (const ring of outerRings(f.geometry)) boxes.push(boxOf(ring));
}
const codes = Object.keys(table).toSorted();
writeFileSync(OUT, `{\n${codes.map((c) => `"${c}":${JSON.stringify(table[c])}`).join(',\n')}\n}\n`);
console.log(
  `${codes.length} countries, ${codes.reduce((n, c) => n + (table[c]?.length ?? 0), 0)} boxes -> ${OUT}`,
);
