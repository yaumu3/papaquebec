import { RBL_SNAP_PX, TARGET_PX } from '../../hit';
import type { Precision, ScopeActions } from '../actions';
import { at, listen, offAll } from '../dom';
import { DRAG_THRESHOLD_PX, type Point } from '../geometry';
import { dragZoomFactor, isDoubleTap, type Pair, pinchOf, type Tap } from './touchGestures';

/** Fingers are less precise than a cursor. */
const FINGER_REACH_PX = 24;
/** A finger lands loosely; neither it nor a pen shows where it is between presses. */
export const FINGER: Precision = { reach: FINGER_REACH_PX, snap: FINGER_REACH_PX, hovers: false };
/** A pen lands as exactly as a cursor. */
export const PEN: Precision = { reach: TARGET_PX, snap: RBL_SNAP_PX, hovers: false };

/** The precision of a non-mouse `pointerType`: a touch is a finger, anything else a pen. */
export function precisionOf(pointerType: string): Precision {
  return pointerType === 'touch' ? FINGER : PEN;
}

/** The parts of a `PointerEvent` the recognizer reads. */
export interface FingerEvent {
  pointerId: number;
  clientX: number;
  clientY: number;
  timeStamp: number;
}

/** What the fingers on the canvas are doing, as the recognizer sees it. */
export interface TouchHandlers {
  /** The first finger landed. */
  press(e: FingerEvent): void;
  /** The first finger stayed down, unmoved, for the long-press delay. */
  longPress(at: Point): void;
  /** A lone finger lifted at `at` without dragging, long-pressing or starting a zoom. */
  tap(at: Point): void;
  /** A second finger landed, or a finger that landed just after a tap began sliding. */
  zoomStart(): void;
  /** Scale the range from the zoom's start by `factor` about `anchor`, which moves to `to`. */
  zoom(anchor: Point, factor: number, to: Point): void;
  /** A pinching finger or the sliding finger lifted. */
  zoomEnd(): void;
}

/** A finger held still this long opens the menu a right click would. */
export const LONG_PRESS_MS = 450;

/**
 * Tracks fingers by pointer id and turns them into press, long-press, pinch and double-tap drag
 * zoom. `move` and `up` return true when a pinch or drag zoom consumed the event, so
 * single-finger drags should ignore it.
 */
export function trackTouches(h: TouchHandlers, longPressMs = LONG_PRESS_MS) {
  const fingers = new Map<number, Point>();
  let pinch: { start: Pair; ids: [number, number] } | null = null;
  let longPress: ReturnType<typeof setTimeout> | null = null;
  /** The lone finger while it can still end as a tap. */
  let tapping: { id: number; at: Point } | null = null;
  let lastTap: Tap | null = null;
  let zoom: { id: number; anchor: Point; started: boolean } | null = null;

  const cancelLongPress = () => {
    if (longPress) clearTimeout(longPress);
    longPress = null;
  };
  const endZoom = () => {
    if (zoom?.started) h.zoomEnd();
    zoom = null;
  };

  const down = (e: FingerEvent) => {
    const p = at(e);
    fingers.set(e.pointerId, p);
    if (fingers.size === 1) {
      const second = isDoubleTap(lastTap, { ...p, t: e.timeStamp });
      // Any other touch between two taps breaks the pair, so only the tap just before counts.
      lastTap = null;
      if (second) {
        zoom = { id: e.pointerId, anchor: p, started: false };
        return;
      }
      tapping = { id: e.pointerId, at: p };
      h.press(e);
      cancelLongPress();
      longPress = setTimeout(() => {
        longPress = null;
        tapping = null;
        h.longPress(p);
      }, longPressMs);
    } else if (fingers.size === 2) {
      cancelLongPress();
      tapping = null;
      endZoom();
      const [a, b] = [...fingers.entries()];
      if (a && b) {
        pinch = { start: [{ ...a[1] }, { ...b[1] }], ids: [a[0], b[0]] };
        h.zoomStart();
      }
    }
  };

  const move = (e: FingerEvent): boolean => {
    if (fingers.has(e.pointerId)) fingers.set(e.pointerId, at(e));
    if (pinch) {
      const a = fingers.get(pinch.ids[0]);
      const b = fingers.get(pinch.ids[1]);
      if (a && b) {
        const p = pinchOf(pinch.start, [a, b]);
        h.zoom(p.anchor, p.factor, p.to);
      }
      return true;
    }
    if (zoom?.id === e.pointerId) {
      const dy = e.clientY - zoom.anchor.y;
      if (!zoom.started && Math.abs(dy) > DRAG_THRESHOLD_PX) {
        zoom.started = true;
        h.zoomStart();
      }
      if (zoom.started) h.zoom(zoom.anchor, dragZoomFactor(dy), zoom.anchor);
      return true;
    }
    if (
      tapping?.id === e.pointerId &&
      Math.hypot(e.clientX - tapping.at.x, e.clientY - tapping.at.y) > DRAG_THRESHOLD_PX
    ) {
      tapping = null;
      cancelLongPress();
    }
    return false;
  };

  /** A finger lifted, or the browser `cancelled` it, which is never a tap. */
  const up = (e: FingerEvent, cancelled = false): boolean => {
    if (!fingers.delete(e.pointerId)) return false;
    cancelLongPress();
    if (pinch) {
      if (fingers.size < 2) {
        pinch = null;
        h.zoomEnd();
      }
      return true;
    }
    if (zoom?.id === e.pointerId) {
      endZoom();
      return true;
    }
    if (tapping?.id === e.pointerId && !cancelled) {
      lastTap = { ...tapping.at, t: e.timeStamp };
      h.tap(at(e));
    } else {
      lastTap = null;
    }
    tapping = null;
    return false;
  };

  /** Whether a double-tap drag zoom owns the current touch. */
  const zooming = () => zoom !== null;

  return { down, move, up, zooming };
}

/**
 * What a finger or pen can ask of the scope: grab and drag, tap, open the menu with a long press,
 * and zoom with a pinch or a double-tap drag. `precision` is that of whatever pressed last.
 */
export function touchBindings(a: ScopeActions, precision: () => Precision): TouchHandlers {
  return {
    press: (e) => a.grab(at(e), precision()),
    longPress: (p) => {
      a.dropGrab();
      a.menu(p, precision());
    },
    tap: (p) => a.tap(p, precision()),
    zoomStart: () => {
      a.dropGrab();
      a.zoomStart();
    },
    zoom: (anchor, factor, to) => a.zoomTo(anchor, factor, to),
    zoomEnd: () => a.zoomEnd(),
  };
}

const isTouch = (e: PointerEvent) => e.pointerType !== 'mouse';

/** Attaches fingers and pens to the canvas. Returns a disposer. */
export function attachTouch(canvas: HTMLCanvasElement, a: ScopeActions): () => void {
  let precision = FINGER;
  const touch = trackTouches(touchBindings(a, () => precision));
  const lift = (e: PointerEvent, cancelled: boolean) => {
    if (isTouch(e) && !touch.up(e, cancelled)) a.release(at(e));
  };
  return offAll([
    listen(canvas, 'pointerdown', (e) => {
      if (!isTouch(e)) return;
      precision = precisionOf(e.pointerType);
      canvas.setPointerCapture(e.pointerId);
      touch.down(e);
    }),
    listen(window, 'pointermove', (e) => {
      if (isTouch(e) && !touch.move(e)) a.dragTo(at(e));
    }),
    listen(window, 'pointerup', (e) => lift(e, false)),
    listen(window, 'pointercancel', (e) => lift(e, true)),
    // iOS shows its text magnifier when a double tap is held; a drag zoom is not a text gesture.
    listen(
      canvas,
      'touchstart',
      (e) => {
        if (touch.zooming()) e.preventDefault();
      },
      { passive: false },
    ),
    // A finger asks for the menu by long press, never by the browser's own.
    listen(canvas, 'contextmenu', (e) => e.preventDefault()),
  ]);
}
