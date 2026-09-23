/** Which openAIP country exports to fetch for a site, from vendored country polygon boxes. */

/** `[minLon, minLat, maxLon, maxLat]`, as plain arrays so the vendored JSON needs no cast. */
export type Box = readonly number[];
export type CountryBoxes = Readonly<Record<string, readonly Box[]>>;

export interface Site {
  lat: number;
  lon: number;
}

/** ISO codes, sorted, of every country with a polygon box touching the site's radius box. */
export function countriesNear(site: Site, radiusNm: number, table: CountryBoxes): string[] {
  const dLat = radiusNm / 60;
  const dLon = dLat / Math.cos((site.lat * Math.PI) / 180);
  const touches = ([minLon = 0, minLat = 0, maxLon = 0, maxLat = 0]: Box) =>
    minLon <= site.lon + dLon &&
    maxLon >= site.lon - dLon &&
    minLat <= site.lat + dLat &&
    maxLat >= site.lat - dLat;
  return Object.keys(table)
    .filter((code) => table[code]?.some(touches))
    .toSorted();
}
