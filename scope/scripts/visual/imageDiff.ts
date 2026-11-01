/** Comparing two screenshots loosely enough to absorb anti-aliasing, tightly enough to see a change. */

/** RGBA pixels, row by row. */
export interface Image {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface Limits {
  /** How far a channel of a pixel may move, of 255, before the pixel counts as differing. */
  channel: number;
  /** The share of the pixels that may differ. */
  share: number;
}

export interface Comparison {
  passed: boolean;
  differing: number;
  share: number;
  /** The baseline dimmed, with the differing pixels in magenta. */
  diff: Image;
}

const MAGENTA = [255, 0, 255, 255];
const DIM = 0.3;

/** Whether the pixel at byte `at` differs past the tolerance. */
function differs(a: Uint8Array, b: Uint8Array, at: number, channel: number): boolean {
  for (let i = at; i < at + 4; i += 1) {
    if (Math.abs((a[i] ?? 0) - (b[i] ?? 0)) > channel) return true;
  }
  return false;
}

/** Compares `actual` with `baseline`; images of different sizes differ altogether. */
export function compareImages(baseline: Image, actual: Image, limits: Limits): Comparison {
  const { width, height } = baseline;
  const data = new Uint8Array(baseline.data.length);
  if (width !== actual.width || height !== actual.height) {
    return { passed: false, differing: width * height, share: 1, diff: { ...baseline, data } };
  }
  let differing = 0;
  for (let at = 0; at < data.length; at += 4) {
    if (differs(baseline.data, actual.data, at, limits.channel)) {
      differing += 1;
      data.set(MAGENTA, at);
    } else {
      const dimmed = [0, 1, 2].map((i) => (baseline.data[at + i] ?? 0) * DIM);
      data.set([...dimmed, 255], at);
    }
  }
  const share = differing / (width * height);
  return { passed: share <= limits.share, differing, share, diff: { width, height, data } };
}

/** A part of an image, in whole pixels. */
export interface Clip {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The part of `whole` under `clip`. */
export function cropImage(whole: Image, { x, y, width, height }: Clip): Image {
  const data = new Uint8Array(width * height * 4);
  const rowBytes = width * 4;
  for (let row = 0; row < height; row += 1) {
    const from = ((y + row) * whole.width + x) * 4;
    data.set(whole.data.subarray(from, from + rowBytes), row * rowBytes);
  }
  return { width, height, data };
}
