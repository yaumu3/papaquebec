import { NM_IN_METERS, type ProjectFn, type UnprojectFn } from '../lib/geo';
import { createLcc, type Projection } from '../lib/projection';
import { bumpProjection, type Site } from './scope';
import { createTrackStore } from './trackStore';

/** Standard parallels straddle the site by this much, degrees. */
const PARALLEL_OFFSET_DEG = 6;

/** The scope's projection: standard parallels straddle the site; the reference meridian is the site's. */
export function siteProjection(site: Site): Projection {
  return createLcc({
    lat0: site.lat,
    lon0: site.lon,
    lat1: site.lat - PARALLEL_OFFSET_DEG,
    lat2: site.lat + PARALLEL_OFFSET_DEG,
  });
}

/** A projection's plane in NM, both ways; world coordinates are NM from the site. */
export function nmPlane(projection: Projection): { project: ProjectFn; unproject: UnprojectFn } {
  return {
    project: (lat, lon) => {
      const p = projection.forward(lat, lon);
      return { x: p.x / NM_IN_METERS, y: p.y / NM_IN_METERS };
    },
    unproject: (x, y) => projection.inverse(x * NM_IN_METERS, y * NM_IN_METERS),
  };
}

let plane: ReturnType<typeof nmPlane> | null = null;

/** World coordinates are NM from the site on the LCC plane. */
export const projectNm: ProjectFn = (lat, lon) =>
  plane ? plane.project(lat, lon) : { x: 0, y: 0 };

/** A point on the scope plane back to where it lies on the earth. */
export const unprojectNm: UnprojectFn = (x, y) =>
  plane ? plane.unproject(x, y) : { lat: 0, lon: 0 };

/** The one track store. Rebuilt from every snapshot; see `trackStore.ts`. */
export const trackStore = createTrackStore(projectNm);

export function configureProjection(site: Site): void {
  plane = nmPlane(siteProjection(site));
  trackStore.reproject(projectNm);
  bumpProjection();
}

export function hasProjection(): boolean {
  return plane !== null;
}
