/** Reference ellipsoid: semi-major axis in meters and inverse flattening. */
import { RAD } from './units';
export interface Ellipsoid {
  a: number;
  invF: number;
}

export const WGS84: Ellipsoid = { a: 6_378_137, invF: 298.257223563 };

/** Standard parallels, latitude of origin and reference meridian, in degrees. */
export interface LccParams {
  lat0: number;
  lon0: number;
  lat1: number;
  lat2: number;
}

export interface Projection {
  /** Geodetic degrees to projected meters, x east, y north. */
  forward(lat: number, lon: number): { x: number; y: number };
  inverse(x: number, y: number): { lat: number; lon: number };
}

/**
 * Lambert Conformal Conic with two standard parallels on an ellipsoid
 * (Snyder 1987, formulas 15-1 to 15-11).
 */
export function createLcc(params: LccParams, ellipsoid: Ellipsoid = WGS84): Projection {
  const { a } = ellipsoid;
  const f = 1 / ellipsoid.invF;
  const e = Math.sqrt(f * (2 - f));
  const phi0 = params.lat0 * RAD;
  const lam0 = params.lon0 * RAD;
  const phi1 = params.lat1 * RAD;
  const phi2 = params.lat2 * RAD;

  const m = (phi: number) => Math.cos(phi) / Math.sqrt(1 - e * e * Math.sin(phi) ** 2);
  const t = (phi: number) => {
    const es = e * Math.sin(phi);
    return Math.tan(Math.PI / 4 - phi / 2) / ((1 - es) / (1 + es)) ** (e / 2);
  };

  const m1 = m(phi1);
  const m2 = m(phi2);
  const t1 = t(phi1);
  const t2 = t(phi2);
  const n =
    Math.abs(phi1 - phi2) < 1e-12
      ? Math.sin(phi1)
      : (Math.log(m1) - Math.log(m2)) / (Math.log(t1) - Math.log(t2));
  const F = m1 / (n * t1 ** n);
  const rho0 = a * F * t(phi0) ** n;

  return {
    forward(lat, lon) {
      const rho = a * F * t(lat * RAD) ** n;
      const theta = n * (lon * RAD - lam0);
      return { x: rho * Math.sin(theta), y: rho0 - rho * Math.cos(theta) };
    },
    inverse(x, y) {
      const dy = rho0 - y;
      const sign = n < 0 ? -1 : 1;
      const rho = sign * Math.hypot(x, dy);
      const theta = Math.atan2(sign * x, sign * dy);
      const tt = (rho / (a * F)) ** (1 / n);
      let phi = Math.PI / 2 - 2 * Math.atan(tt);
      for (let i = 0; i < 12; i++) {
        const es = e * Math.sin(phi);
        const next = Math.PI / 2 - 2 * Math.atan(tt * ((1 - es) / (1 + es)) ** (e / 2));
        if (Math.abs(next - phi) < 1e-14) {
          phi = next;
          break;
        }
        phi = next;
      }
      return { lat: phi / RAD, lon: (theta / n + lam0) / RAD };
    },
  };
}
