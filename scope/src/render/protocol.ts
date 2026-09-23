/**
 * Messages between the main thread and the render worker. Everything the
 * worker draws arrives as packed Float32Array instance buffers; the worker
 * keeps no scene state beyond those buffers.
 */

/** Floats per instance. See `pack.ts` for the layouts. */
export const LINE_STRIDE = 16;
export const MARKER_STRIDE = 12;
export const TEXT_STRIDE = 16;

export type BatchKind = 'lines' | 'markers' | 'text';

export interface Batch {
  kind: BatchKind;
  data: Float32Array;
  count: number;
}

export const enum Shape {
  Square = 0,
  SquareRing = 1,
  Diamond = 2,
  HollowDiamond = 3,
  Triangle = 4,
  Hexagon = 5,
  Dot = 6,
  Ring = 7,
  HollowSquare = 8,
}

/** Camera: world NM to CSS pixels. */
export interface View {
  centerX: number;
  centerY: number;
  pxPerNm: number;
  widthPx: number;
  heightPx: number;
  dpr: number;
}

export interface AtlasInfo {
  width: number;
  height: number;
  cellW: number;
  cellH: number;
  columns: number;
  /** Font size the atlas was rasterised at, in px. */
  fontSize: number;
  /** Distance-field spread in atlas px. */
  buffer: number;
  /** Baseline offset from the cell top, in atlas px. */
  baseline: number;
  /** Glyph advance at `fontSize`, in px. */
  advance: number;
  chars: string;
}

export type ToWorker =
  | { type: 'probe' }
  | { type: 'init'; canvas: OffscreenCanvas; view: View }
  | { type: 'atlas'; info: AtlasInfo; pixels: Uint8Array }
  | { type: 'layer'; name: string; batches: Batch[] }
  | { type: 'view'; view: View }
  | { type: 'draw'; order: string[] };

export type FromWorker =
  | { type: 'probe'; webgpu: boolean }
  | { type: 'ready'; adapter: string }
  | { type: 'error'; message: string }
  | { type: 'lost'; reason: string };
