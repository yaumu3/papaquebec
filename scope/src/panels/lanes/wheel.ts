/** Where on the lanes a wheel event lands. */
export type Area = 'plot' | 'axis' | 'row' | 'gutter' | 'other';

/** What a wheel gesture does: scroll the column, zoom the window or pan it. */
export type WheelMeaning = 'scroll' | 'zoom' | 'pan';

/** A wheel event as the rules read it: deltas in pixels, `at` in ms. */
export interface WheelEvt {
  area: Area;
  dx: number;
  dy: number;
  shift: boolean;
  at: number;
}

/** A run of wheel events that mean one thing, up to the time of the latest. */
export interface WheelGesture {
  meaning: WheelMeaning;
  at: number;
}

/** The pause that ends a wheel gesture: momentum scrolling keeps its events closer than this. */
export const WHEEL_GAP_MS = 200;
const LINE_PX = 100 / 3;
const PAGE_PX = 300;

/** A wheel delta in pixels, by its `deltaMode`: pixels, lines or pages. */
export const wheelPx = (delta: number, mode: number): number =>
  mode === 1 ? delta * LINE_PX : mode === 2 ? delta * PAGE_PX : delta;

/** How far a pan event moves: the sideways delta, or the vertical one when shift turns it sideways. */
export const panDelta = (e: WheelEvt): number => (e.shift && e.dx === 0 ? e.dy : e.dx);

const isSideways = (e: WheelEvt): boolean =>
  (e.shift && e.dy !== 0) || Math.abs(e.dx) > Math.abs(e.dy);

function meaningOf(e: WheelEvt): WheelMeaning {
  if (e.area !== 'plot' && e.area !== 'axis') return 'scroll';
  return isSideways(e) ? 'pan' : 'zoom';
}

/** The gesture `e` belongs to: the one before it if it came within the gap, else a new one by where and which way. */
export function wheelGestureOf(prev: WheelGesture | null, e: WheelEvt): WheelGesture {
  const continues = prev !== null && e.at - prev.at <= WHEEL_GAP_MS;
  return { meaning: continues ? prev.meaning : meaningOf(e), at: e.at };
}

/** Whether the lanes take the gesture, so that the page does not scroll or navigate from it. */
export const consumes = (meaning: WheelMeaning): boolean => meaning !== 'scroll';
