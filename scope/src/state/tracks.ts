import { NM_IN_METERS } from '../lib/geo';
import { createLcc, type Projection } from '../lib/projection';
import { bumpProjection, type Site } from './scope';
import { createTrackStore, type ProjectFn } from './trackStore';

let projection: Projection | null = null;

/** World coordinates are NM from the site on the LCC plane. */
export const projectNm: ProjectFn = (lat, lon) => {
  if (!projection) return { x: 0, y: 0 };
  const p = projection.forward(lat, lon);
  return { x: p.x / NM_IN_METERS, y: p.y / NM_IN_METERS };
};

/** The one track store. Rebuilt from every snapshot; see `trackStore.ts`. */
export const trackStore = createTrackStore(projectNm);

/** Standard parallels straddle the site by this much, degrees. */
const PARALLEL_OFFSET_DEG = 6;

/** Standard parallels straddle the site; the reference meridian is the site's. */
export function configureProjection(site: Site): void {
  projection = createLcc({
    lat0: site.lat,
    lon0: site.lon,
    lat1: site.lat - PARALLEL_OFFSET_DEG,
    lat2: site.lat + PARALLEL_OFFSET_DEG,
  });
  trackStore.reproject(projectNm);
  bumpProjection();
}

export function hasProjection(): boolean {
  return projection !== null;
}
