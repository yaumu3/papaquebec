import type { RangeCursorOrigin } from '../../../state/scope';
import { RBL_SNAP_PX, TARGET_PX } from '../../hit';
import type { Precision, ScopeActions } from '../actions';
import { at, listen, offAll } from '../dom';
import { DRAG_THRESHOLD_PX, type Point } from '../geometry';

/** A mouse cursor lands exactly and shows where it is between presses. */
export const CURSOR: Precision = { reach: TARGET_PX, snap: RBL_SNAP_PX, hovers: true };

/** The parts of a `PointerEvent` the recognizer reads. */
export interface ButtonEvent {
  button: number;
  clientX: number;
  clientY: number;
}

/** What the mouse buttons are doing, as the recognizer sees it. */
export interface MouseHandlers<O> {
  /** The left button went down. */
  press(at: Point): void;
  /** The left button came up after going down on the canvas, or the browser `cancelled` it. */
  release(at: Point, cancelled: boolean): void;
  /** The right button went down; returns the origin a range cursor from here would measure from. */
  rightPress(at: Point): O;
  /** The right button dragged past the threshold. */
  rangeStart(origin: O): void;
  /** The right button came up. */
  rangeEnd(): void;
  /** A right click that did not drag. */
  menu(at: Point): void;
}

/** How long after a right drag a stray `contextmenu` is swallowed. */
export const MENU_QUIET_MS = 50;

/**
 * Turns mouse buttons into press, right-drag range cursor and context menu. `contextMenu` takes
 * the browser's `contextmenu`, which macOS fires on mousedown and others on mouseup.
 */
export function trackMouse<O>(h: MouseHandlers<O>, quietMs = MENU_QUIET_MS) {
  let pressing = false;
  let right: { at: Point; started: boolean; origin: O } | null = null;
  /** A menu asked for mid-press, held until the release shows it was not a drag. */
  let heldMenu: Point | null = null;
  let quiet = false;

  const down = (e: ButtonEvent) => {
    const p = at(e);
    if (e.button === 2) right = { at: p, started: false, origin: h.rightPress(p) };
    else if (e.button === 0) {
      pressing = true;
      h.press(p);
    }
  };

  const move = (e: Pick<ButtonEvent, 'clientX' | 'clientY'>) => {
    if (!right || right.started) return;
    if (Math.hypot(e.clientX - right.at.x, e.clientY - right.at.y) > DRAG_THRESHOLD_PX) {
      right.started = true;
      h.rangeStart(right.origin);
    }
  };

  const up = (e: ButtonEvent, cancelled = false) => {
    if (e.button === 0 && pressing) {
      pressing = false;
      h.release(at(e), cancelled);
    }
    if (e.button !== 2 || !right) return;
    if (right.started) {
      quiet = true;
      setTimeout(() => {
        quiet = false;
      }, quietMs);
    } else if (heldMenu) {
      h.menu(heldMenu);
    }
    heldMenu = null;
    right = null;
    h.rangeEnd();
  };

  const contextMenu = (p: Point) => {
    if (quiet) return;
    if (right && !right.started) {
      heldMenu = p;
      return;
    }
    h.menu(p);
  };

  return { down, move, up, contextMenu };
}

/**
 * What the mouse can ask of the scope: grab and drag with the left button, tap by clicking without
 * dragging, measure range with a right drag, and open the menu with a right click.
 */
export function mouseBindings(a: ScopeActions): MouseHandlers<RangeCursorOrigin> {
  return {
    press: (p) => a.grab(p, CURSOR),
    release: (p, cancelled) => {
      if (!a.release(p) && !cancelled) a.tap(p, CURSOR);
    },
    rightPress: (p) => a.rangeOrigin(p),
    rangeStart: (origin) => a.showRange(origin),
    rangeEnd: () => a.showRange(null),
    menu: (p) => a.menu(p, CURSOR),
  };
}

const isMouse = (e: PointerEvent) => e.pointerType === 'mouse';

/** Wheel sensitivity: one 100 px notch scales the range by about 1.2. */
const ZOOM_PER_PX = 0.0018;

/** Attaches the mouse's buttons, wheel and hover to the canvas. Returns a disposer. */
export function attachMouse(canvas: HTMLCanvasElement, a: ScopeActions): () => void {
  const mouse = trackMouse(mouseBindings(a));
  /** Whether the last press on the canvas was the mouse's, so the context menu it raises is too. */
  let mine = false;
  return offAll([
    listen(canvas, 'pointerdown', (e) => {
      mine = isMouse(e);
      if (!mine) return;
      mouse.down(e);
      if (e.button === 0) e.preventDefault();
    }),
    listen(window, 'pointermove', (e) => {
      if (!isMouse(e)) return;
      mouse.move(e);
      a.dragTo(at(e));
    }),
    listen(window, 'pointerup', (e) => {
      if (isMouse(e)) mouse.up(e);
    }),
    listen(window, 'pointercancel', (e) => {
      if (isMouse(e)) mouse.up(e, true);
    }),
    listen(canvas, 'pointermove', (e) => {
      if (isMouse(e)) a.hover(at(e));
    }),
    listen(canvas, 'pointerleave', (e) => {
      if (isMouse(e)) a.hover(null);
    }),
    listen(
      canvas,
      'wheel',
      (e) => {
        e.preventDefault();
        a.zoomBy(at(e), Math.exp(e.deltaY * ZOOM_PER_PX));
      },
      { passive: false },
    ),
    listen(canvas, 'contextmenu', (e) => {
      e.preventDefault();
      if (mine) mouse.contextMenu(at(e));
    }),
  ]);
}
