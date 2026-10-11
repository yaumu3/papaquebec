import type { Detent } from '../state/layout';

/** UIScrollView's normal deceleration, the share of its speed a coasting scroll keeps each ms. */
const DECELERATION = 0.998;

/** How stiff the rubber band is past an edge, as UIScrollView's. */
const RUBBER = 0.55;

/** How far a flick at `velocity` px/ms would coast before it stopped, px. */
export function projectFlick(velocity: number): number {
  return (velocity * DECELERATION) / (1 - DECELERATION);
}

/** How far a sheet gives when pulled `overshoot` px past an edge of a `dimension` px room. */
export function rubberBand(overshoot: number, dimension: number): number {
  return (1 - 1 / ((overshoot * RUBBER) / dimension + 1)) * dimension;
}

/**
 * How a sheet is drawn when `extent` px of it should show: it grows between its smallest and
 * largest detents, slides down whole below the smallest, and stretches on a rubber band above
 * the largest.
 */
export function sheetFrame(
  extent: number,
  smallest: number,
  largest: number,
): { height: number; shift: number } {
  if (extent > largest)
    return { height: largest + rubberBand(extent - largest, largest), shift: 0 };
  if (extent >= smallest) return { height: extent, shift: 0 };
  return { height: smallest, shift: smallest - Math.max(extent, 0) };
}

/** A height a let-go sheet can come to rest at; a null detent is closed. */
export interface SheetStop {
  detent: Detent | null;
  extent: number;
}

/** A flick at least this fast, px/ms, is a fling, which may carry a sheet past the next stop. */
export const FLING_PX_PER_MS = 3;

/** Of `stops`, the one nearest `extent`. */
function nearest(stops: readonly SheetStop[], extent: number): SheetStop | undefined {
  let best: SheetStop | undefined;
  for (const stop of stops) {
    if (!best || Math.abs(stop.extent - extent) < Math.abs(best.extent - extent)) best = stop;
  }
  return best;
}

/**
 * Where a sheet let go at `extent` px and `velocity` px/ms comes to rest: the stop nearest where
 * its flick would coast to, out of the stops either side of it unless the flick is a fling.
 * `stops` run from lowest to highest.
 */
export function settle(
  extent: number,
  velocity: number,
  stops: readonly SheetStop[],
): Detent | null {
  const coast = extent + projectFlick(velocity);
  if (Math.abs(velocity) >= FLING_PX_PER_MS) return nearest(stops, coast)?.detent ?? null;
  const below = stops.findLast((s) => s.extent <= extent);
  const above = stops.find((s) => s.extent > extent);
  const either = [below, above].filter((s) => s !== undefined);
  return nearest(either, coast)?.detent ?? null;
}

/** Where a sheet with `detents` can rest, given how tall each detent is: closed, or at any of them. */
export function sheetStops(
  detents: readonly Detent[],
  heights: Record<Detent, number>,
): SheetStop[] {
  return [
    { detent: null, extent: 0 },
    ...detents.map((detent) => ({ detent, extent: heights[detent] })),
  ];
}

/**
 * Whether a finger's first move on a sheet's content moves the sheet rather than scrolling the
 * content, as SwiftUI's sheets grow before they scroll: up while the sheet is short of its largest
 * detent, down while the content is scrolled to its top. A sideways move is the content's.
 */
export function contentMovesSheet(move: {
  up: number;
  across: number;
  atLargest: boolean;
  atTop: boolean;
}): boolean {
  if (Math.abs(move.across) >= Math.abs(move.up)) return false;
  return move.up > 0 ? !move.atLargest : move.atTop;
}

/** Whether a sheet shows its grabber, as SwiftUI's automatic drag indicator: only with detents to go between. */
export function grabberShown(detents: readonly Detent[]): boolean {
  return detents.length > 1;
}
