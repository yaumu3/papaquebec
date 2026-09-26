import { DRAG_THRESHOLD_PX, type Point } from '../geometry';
import { isDoubleTap, type Pair, type Tap } from './touchGestures';

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
  /** A second finger landed; `start` holds both positions. */
  pinchStart(start: Pair): void;
  pinch(start: Pair, now: Pair): void;
  /** One of the two pinching fingers lifted. */
  pinchEnd(): void;
  /** A finger that landed just after a tap began sliding; `anchor` is where it landed. */
  zoomDragStart(anchor: Point): void;
  /** That finger is now `dy` px below `anchor` (negative above). */
  zoomDrag(anchor: Point, dy: number): void;
  zoomDragEnd(): void;
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
    if (zoom?.started) h.zoomDragEnd();
    zoom = null;
  };

  const down = (e: FingerEvent) => {
    const at = { x: e.clientX, y: e.clientY };
    fingers.set(e.pointerId, at);
    if (fingers.size === 1) {
      const second = isDoubleTap(lastTap, { ...at, t: e.timeStamp });
      // Any other touch between two taps breaks the pair, so only the tap just before counts.
      lastTap = null;
      if (second) {
        zoom = { id: e.pointerId, anchor: at, started: false };
        return;
      }
      tapping = { id: e.pointerId, at };
      h.press(e);
      cancelLongPress();
      longPress = setTimeout(() => {
        longPress = null;
        tapping = null;
        h.longPress(at);
      }, longPressMs);
    } else if (fingers.size === 2) {
      cancelLongPress();
      tapping = null;
      endZoom();
      const [a, b] = [...fingers.entries()];
      if (a && b) {
        pinch = { start: [{ ...a[1] }, { ...b[1] }], ids: [a[0], b[0]] };
        h.pinchStart(pinch.start);
      }
    }
  };

  const move = (e: FingerEvent): boolean => {
    if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) {
      const a = fingers.get(pinch.ids[0]);
      const b = fingers.get(pinch.ids[1]);
      if (a && b) h.pinch(pinch.start, [a, b]);
      return true;
    }
    if (zoom?.id === e.pointerId) {
      const dy = e.clientY - zoom.anchor.y;
      if (!zoom.started && Math.abs(dy) > DRAG_THRESHOLD_PX) {
        zoom.started = true;
        h.zoomDragStart(zoom.anchor);
      }
      if (zoom.started) h.zoomDrag(zoom.anchor, dy);
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

  const up = (e: FingerEvent): boolean => {
    if (!fingers.delete(e.pointerId)) return false;
    cancelLongPress();
    if (pinch) {
      if (fingers.size < 2) {
        pinch = null;
        h.pinchEnd();
      }
      return true;
    }
    if (zoom?.id === e.pointerId) {
      endZoom();
      return true;
    }
    lastTap = tapping?.id === e.pointerId ? { ...tapping.at, t: e.timeStamp } : null;
    tapping = null;
    return false;
  };

  /** Whether a double-tap drag zoom owns the current touch. */
  const zooming = () => zoom !== null;

  return { down, move, up, zooming };
}
