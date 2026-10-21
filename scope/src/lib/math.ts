/** `v` held within `lo` and `hi`. */
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** `v` wrapped into 0 up to but not including `wrap`, whichever way round it lies. */
export const onCircle = (v: number, wrap: number): number => ((v % wrap) + wrap) % wrap;
