import { RAD } from './units';
import { WMM2025, WMM2025_EPOCH } from './wmm2025';

const A_KM = 6378.137;
const B_KM = 6356.7523142;
const E2 = 1 - (B_KM * B_KM) / (A_KM * A_KM);
/** Geomagnetic reference radius. */
const RE_KM = 6371.2;
const MAX_N = 12;

/** Values indexed by degree n and order m ≤ n. */
class Triangular {
  private readonly v: Float64Array;
  constructor(maxN: number) {
    this.v = new Float64Array(((maxN + 1) * (maxN + 2)) / 2);
  }
  get(n: number, m: number): number {
    return this.v[(n * (n + 1)) / 2 + m] ?? 0;
  }
  set(n: number, m: number, value: number): void {
    this.v[(n * (n + 1)) / 2 + m] = value;
  }
}

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/** Schmidt semi-normalization factor for degree n, order m. */
function schmidt(n: number, m: number): number {
  return Math.sqrt(((m === 0 ? 1 : 2) * factorial(n - m)) / factorial(n + m));
}

/** Decimal year, as WMM expects. */
export function decimalYear(date: Date): number {
  const y = date.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  return y + (date.getTime() - start) / (end - start);
}

/**
 * Magnetic declination in degrees, east positive, from WMM2025.
 * Height is kilometers above the WGS-84 ellipsoid; `year` is decimal.
 */
export function magneticDeclination(
  lat: number,
  lon: number,
  heightKm: number,
  year: number,
): number {
  const phi = lat * RAD;
  const lam = lon * RAD;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);

  // Geodetic to geocentric spherical.
  const rc = A_KM / Math.sqrt(1 - E2 * sinPhi * sinPhi);
  const p = (rc + heightKm) * cosPhi;
  const z = (rc * (1 - E2) + heightKm) * sinPhi;
  const r = Math.hypot(p, z);
  const phiC = Math.asin(z / r);
  const x = Math.sin(phiC);
  const cosC = Math.cos(phiC);

  // Unnormalized associated Legendre P(n,m) at x and their derivatives in φ'.
  const P = new Triangular(MAX_N);
  const dP = new Triangular(MAX_N);
  P.set(0, 0, 1);
  for (let m = 1; m <= MAX_N; m++) {
    P.set(m, m, (2 * m - 1) * cosC * P.get(m - 1, m - 1));
  }
  for (let m = 0; m < MAX_N; m++) {
    P.set(m + 1, m, (2 * m + 1) * x * P.get(m, m));
  }
  for (let n = 2; n <= MAX_N; n++) {
    for (let m = 0; m <= n - 2; m++) {
      P.set(n, m, ((2 * n - 1) * x * P.get(n - 1, m) - (n + m - 1) * P.get(n - 2, m)) / (n - m));
    }
  }
  for (let n = 1; n <= MAX_N; n++) {
    for (let m = 0; m <= n; m++) {
      const pPrev = m <= n - 1 ? P.get(n - 1, m) : 0;
      // dP/dφ' = ((n+m) P_{n−1}^m − n x P_n^m) / cos φ'
      dP.set(n, m, ((n + m) * pPrev - n * x * P.get(n, m)) / cosC);
    }
  }

  const dt = year - WMM2025_EPOCH;
  const ratio = RE_KM / r;
  let bx = 0;
  let by = 0;
  let bz = 0;
  for (const [n, m, g0, h0, gd, hd] of WMM2025) {
    const g = g0 + dt * gd;
    const h = h0 + dt * hd;
    const s = schmidt(n, m);
    const pnm = s * P.get(n, m);
    const dpnm = s * dP.get(n, m);
    const rn = ratio ** (n + 2);
    const cosM = Math.cos(m * lam);
    const sinM = Math.sin(m * lam);
    bx -= rn * (g * cosM + h * sinM) * dpnm;
    by += (rn * m * (g * sinM - h * cosM) * pnm) / cosC;
    bz -= rn * (n + 1) * (g * cosM + h * sinM) * pnm;
  }

  // Rotate from geocentric to geodetic frame.
  const psi = phiC - phi;
  const X = bx * Math.cos(psi) - bz * Math.sin(psi);
  const Y = by;
  return Math.atan2(Y, X) / RAD;
}
