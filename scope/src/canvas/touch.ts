export interface Point {
  x: number;
  y: number;
}

/** The parts of a `PointerEvent` the recognizer reads. */
export interface FingerEvent {
  pointerId: number;
  clientX: number;
  clientY: number;
}

export type Pair = [Point, Point];

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
}

/** A finger held still this long opens the menu a right click would. */
export const LONG_PRESS_MS = 450;

/**
 * Tracks fingers by pointer id and turns them into press, long-press and pinch. `move` and `up`
 * return true when a pinch consumed the event, so single-finger drags should ignore it.
 */
export function trackTouches(h: TouchHandlers, longPressMs = LONG_PRESS_MS) {
  const fingers = new Map<number, Point>();
  let pinch: { start: Pair; ids: [number, number] } | null = null;
  let longPress: ReturnType<typeof setTimeout> | null = null;

  const cancelLongPress = () => {
    if (longPress) clearTimeout(longPress);
    longPress = null;
  };

  const down = (e: FingerEvent) => {
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size === 1) {
      h.press(e);
      cancelLongPress();
      longPress = setTimeout(() => {
        longPress = null;
        h.longPress({ x: e.clientX, y: e.clientY });
      }, longPressMs);
    } else if (fingers.size === 2) {
      cancelLongPress();
      const [a, b] = [...fingers.entries()];
      if (a && b) {
        pinch = { start: [{ ...a[1] }, { ...b[1] }], ids: [a[0], b[0]] };
        h.pinchStart(pinch.start);
      }
    }
  };

  const move = (e: FingerEvent): boolean => {
    if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!pinch) return false;
    const a = fingers.get(pinch.ids[0]);
    const b = fingers.get(pinch.ids[1]);
    if (a && b) h.pinch(pinch.start, [a, b]);
    return true;
  };

  const up = (e: FingerEvent): boolean => {
    if (!fingers.delete(e.pointerId)) return false;
    cancelLongPress();
    if (!pinch) return false;
    if (fingers.size < 2) {
      pinch = null;
      h.pinchEnd();
    }
    return true;
  };

  return { down, move, up, cancelLongPress };
}
