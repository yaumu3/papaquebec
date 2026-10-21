import { type Accessor, createEffect, onCleanup } from 'solid-js';

import {
  type Interval,
  type LanesWindow,
  lengthOf,
  panWindow,
  pinchWindow,
  timeAt,
  zoomWindow,
} from '../../state/window';
import {
  type Area,
  consumes,
  gestureFactor,
  panDelta,
  type WheelGesture,
  wheelGestureOf,
  wheelPx,
} from './wheel';

/** How much a wheel notch of `NOTCH_PX` pixels scales the window's length. */
const ZOOM_PER_NOTCH = 1.2;
const NOTCH_PX = 100;
/** How many pixels of a trackpad pinch's ctrl wheel halve the window. */
const PINCH_HALF_PX = 100;

/** What the window input reads and writes. */
interface WindowInputDeps {
  scroller: Accessor<HTMLElement | undefined>;
  /** Where the plots start across the page, and how wide they are. */
  plotLeft: () => number;
  plotWidth: () => number;
  /** A point across the page as a point across the plots, kept inside them. */
  plotPx: (clientX: number) => number;
  window: () => LanesWindow;
  visible: () => Interval;
  contact: () => Interval;
  setWindow: (w: LanesWindow) => void;
  /** Whether a second finger landing now pinches, and ending the first finger's gesture when it does. */
  pinchable: () => boolean;
  abandon: () => void;
}

/** Where on the lanes `target` is. */
export function areaOf(target: EventTarget | null): Area {
  if (!(target instanceof Element)) return 'other';
  if (target.closest('[data-axis]')) return 'axis';
  if (!target.closest('[data-lane="history"]')) return 'other';
  if (target.closest('[data-row]')) return 'row';
  return target.closest('[data-plot]') ? 'plot' : 'gutter';
}

/** Safari's pinch gesture events, which lib.dom does not type. */
interface GestureLike {
  scale: number;
  clientX: number;
}
const isGesture = (e: Event): e is Event & GestureLike => 'scale' in e && 'clientX' in e;

/**
 * Zooms and pans the window with the wheel and the trackpad pinch over the plots and the axis,
 * leaving the rest to scroll the column.
 */
export function createWindowInput(deps: WindowInputDeps): void {
  let gesture: WheelGesture | null = null;
  /** Safari's pinch, from its start over a plot or the axis: the last scale seen. */
  let pinch: { scale: number } | null = null;
  /** The touch pointers down, at their x across the page, and the two pinching with the window they began on. */
  const touches = new Map<number, number>();
  let fingers: {
    ids: [number, number];
    x0: [number, number];
    start: { w: LanesWindow; visible: Interval };
  } | null = null;
  const move = (to: (w: LanesWindow, visible: Interval) => LanesWindow) => {
    deps.setWindow(to(deps.window(), deps.visible()));
  };
  const zoomBy = (factor: number, clientX: number) =>
    move((w, visible) => {
      const pivot = timeAt(deps.plotPx(clientX), visible, deps.plotWidth());
      return zoomWindow(w, visible, factor, pivot, deps.contact());
    });
  const onWheel = (e: WheelEvent) => {
    const dx = wheelPx(e.deltaX, e.deltaMode);
    const dy = wheelPx(e.deltaY, e.deltaMode);
    const evt = {
      area: areaOf(e.target),
      dx,
      dy,
      shift: e.shiftKey,
      ctrl: e.ctrlKey,
      at: e.timeStamp,
    };
    gesture = wheelGestureOf(gesture, evt);
    if (!consumes(gesture.meaning)) return;
    e.preventDefault();
    if (gesture.meaning === 'zoom') zoomBy(ZOOM_PER_NOTCH ** (dy / NOTCH_PX), e.clientX);
    else if (gesture.meaning === 'pinch') zoomBy(2 ** (dy / PINCH_HALF_PX), e.clientX);
    else
      move((w, v) =>
        panWindow(
          w,
          v,
          (panDelta(evt) * lengthOf(v)) / Math.max(1, deps.plotWidth()),
          deps.contact(),
        ),
      );
  };
  const onGestureStart = (e: Event) => {
    pinch = ['plot', 'axis'].includes(areaOf(e.target)) && touches.size === 0 ? { scale: 1 } : null;
    if (pinch) e.preventDefault();
  };
  const onGestureChange = (e: Event) => {
    if (!pinch || !isGesture(e)) return;
    e.preventDefault();
    zoomBy(gestureFactor(pinch.scale, e.scale), e.clientX);
    pinch.scale = e.scale;
  };
  const onGestureEnd = () => (pinch = null);
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    if (e.type !== 'pointerdown') {
      touches.delete(e.pointerId);
      if (fingers?.ids.includes(e.pointerId)) fingers = null;
      return;
    }
    touches.set(e.pointerId, e.clientX);
    const [one, two] = [...touches];
    if (touches.size === 2 && one && two && deps.pinchable()) {
      deps.abandon();
      const start = { w: deps.window(), visible: deps.visible() };
      fingers = { ids: [one[0], two[0]], x0: [one[1], two[1]], start };
    }
  };
  const onFingerMove = (e: PointerEvent) => {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, e.clientX);
    if (!fingers?.ids.includes(e.pointerId)) return;
    const [i, j] = fingers.ids;
    const left = deps.plotLeft();
    const [a, b] = [(touches.get(i) ?? 0) - left, (touches.get(j) ?? 0) - left];
    const [a0, b0] = [fingers.x0[0] - left, fingers.x0[1] - left];
    deps.setWindow(pinchWindow(fingers.start, a0, b0, a, b, deps.plotWidth(), deps.contact()));
  };
  createEffect(() => {
    const el = deps.scroller();
    if (!el) return;
    const ac = new AbortController();
    const opts = { passive: false, signal: ac.signal };
    el.addEventListener('wheel', onWheel, opts);
    el.addEventListener('gesturestart', onGestureStart, opts);
    el.addEventListener('gesturechange', onGestureChange, opts);
    el.addEventListener('gestureend', onGestureEnd, { signal: ac.signal });
    el.addEventListener('pointerdown', onPointer, { signal: ac.signal });
    el.addEventListener('touchmove', (t) => fingers && t.preventDefault(), opts);
    document.addEventListener('pointerup', onPointer, { signal: ac.signal });
    document.addEventListener('pointercancel', onPointer, { signal: ac.signal });
    document.addEventListener('pointermove', onFingerMove, { signal: ac.signal });
    onCleanup(() => ac.abort());
  });
}
