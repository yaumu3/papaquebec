/**
 * The World Magnetic Model, as the wmm crate compiled to WebAssembly answers it: the declination
 * where a bearing is measured, from a mesh of cells the model is evaluated on once each.
 */
import init, { declinationDeg, yearOf } from './wasm/wmm';

/** The magnetic declination at a position, degrees east positive. */
export type Declination = (lat: number, lon: number) => number;

/**
 * The cells the model is evaluated on, in degrees of latitude and longitude. Across one, the
 * declination changes by under a tenth of a degree in the latitudes aircraft fly, which bearings
 * shown to the degree make nothing of.
 */
export const MESH_DEG = 0.5;

/** The declination at the centre of the cell a position falls in, each cell evaluated once. */
export function meshed(model: Declination, meshDeg = MESH_DEG): Declination {
  const cells = new Map<string, number>();
  return (lat, lon) => {
    const i = Math.round(lat / meshDeg);
    const j = Math.round(lon / meshDeg);
    const key = `${i},${j}`;
    let declination = cells.get(key);
    if (declination === undefined) {
      declination = model(i * meshDeg, j * meshDeg);
      cells.set(key, declination);
    }
    return declination;
  };
}

let loaded: Promise<void> | undefined;

/** The declination as of the clock's time, on the mesh; the model is instantiated once. */
export async function loadDeclination(now = Date.now()): Promise<Declination> {
  loaded ??= init().then(() => undefined);
  await loaded;
  const year = yearOf(now / 1000);
  return meshed((lat, lon) => declinationDeg(lat, lon, year));
}
