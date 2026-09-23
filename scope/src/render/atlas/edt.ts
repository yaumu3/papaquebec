export const INF = 1e20;

/**
 * Squared Euclidean distance transform, Felzenszwalb & Huttenlocher 2012.
 * `grid` holds 0 on feature cells and INF elsewhere; on return each cell holds
 * the squared distance to the nearest feature cell. Separable: columns, then rows.
 */
export function edt(grid: Float64Array, width: number, height: number): void {
  const n = Math.max(width, height);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x] ?? INF;
    edt1d(f, d, v, z, height);
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y] ?? INF;
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = grid[y * width + x] ?? INF;
    edt1d(f, d, v, z, width);
    for (let x = 0; x < width; x++) grid[y * width + x] = d[x] ?? INF;
  }
}

function edt1d(f: Float64Array, d: Float64Array, v: Int32Array, z: Float64Array, n: number): void {
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  let k = 0;
  for (let q = 1; q < n; q++) {
    const fq = (f[q] ?? INF) + q * q;
    let s: number;
    for (;;) {
      const vk = v[k] ?? 0;
      s = (fq - ((f[vk] ?? INF) + vk * vk)) / (2 * q - 2 * vk);
      if (s > (z[k] ?? -INF) || k === 0) break;
      k--;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while ((z[k + 1] ?? INF) < q) k++;
    const vk = v[k] ?? 0;
    d[q] = (q - vk) * (q - vk) + (f[vk] ?? INF);
  }
}
