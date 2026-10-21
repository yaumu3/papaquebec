import { type Accessor, createEffect, onCleanup } from 'solid-js';

import { clamp } from '../../lib/math';
import { type Interval, type LanesWindow, panWindow, timeAt, zoomWindow } from '../../state/window';
import { type Area, consumes, panDelta, type WheelGesture, wheelGestureOf, wheelPx } from './wheel';

/** How much a wheel notch of `NOTCH_PX` pixels scales the window's length. */
const ZOOM_PER_NOTCH = 1.2;
const NOTCH_PX = 100;

/** What the window input reads and writes. */
interface WindowInputDeps {
  scroller: Accessor<HTMLElement | undefined>;
  /** Where the plots start across the page, and how wide they are. */
  plotLeft: () => number;
  plotWidth: () => number;
  window: () => LanesWindow;
  visible: () => Interval;
  contact: () => Interval;
  setWindow: (w: LanesWindow) => void;
}

/** Where on the lanes `target` is. */
function areaOf(target: EventTarget | null): Area {
  if (!(target instanceof Element)) return 'other';
  if (target.closest('[data-axis]')) return 'axis';
  if (!target.closest('[data-lane="history"]')) return 'other';
  if (target.closest('[data-row]')) return 'row';
  return target.closest('[data-plot]') ? 'plot' : 'gutter';
}

/** Zooms and pans the window with the wheel over the plots and the axis, leaving the rest to scroll the column. */
export function createWindowInput(deps: WindowInputDeps): void {
  let gesture: WheelGesture | null = null;
  const onWheel = (e: WheelEvent) => {
    const dx = wheelPx(e.deltaX, e.deltaMode);
    const dy = wheelPx(e.deltaY, e.deltaMode);
    const evt = { area: areaOf(e.target), dx, dy, shift: e.shiftKey, at: e.timeStamp };
    gesture = wheelGestureOf(gesture, evt);
    if (!consumes(gesture.meaning)) return;
    e.preventDefault();
    const visible = deps.visible();
    const w = deps.window();
    const next =
      gesture.meaning === 'zoom'
        ? zoomWindow(
            w,
            visible,
            ZOOM_PER_NOTCH ** (dy / NOTCH_PX),
            timeAt(
              clamp(e.clientX - deps.plotLeft(), 0, deps.plotWidth()),
              visible,
              deps.plotWidth(),
            ),
            deps.contact(),
          )
        : panWindow(
            w,
            visible,
            (panDelta(evt) * (visible.to - visible.from)) / Math.max(1, deps.plotWidth()),
            deps.contact(),
          );
    if (next !== w) deps.setWindow(next);
  };
  createEffect(() => {
    const el = deps.scroller();
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    onCleanup(() => el.removeEventListener('wheel', onWheel));
  });
}
