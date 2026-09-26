import type { View } from '../../render/protocol';
import type { RangeCursorOrigin } from '../../state/scope';
import { RBL_SNAP_PX, TARGET_PX } from '../hit';
import { createActions, type Precision } from './actions';
import { attachKeyboard } from './devices/keyboard';
import { FINGER, precisionOf, trackTouches } from './devices/touch';
import { at } from './dom';
import { DRAG_THRESHOLD_PX, type Point } from './geometry';

/** Wheel sensitivity: one 100 px notch scales the range by about 1.2. */
const ZOOM_PER_PX = 0.0018;
/** A mouse cursor lands exactly and shows where it is between presses. */
const CURSOR: Precision = { reach: TARGET_PX, snap: RBL_SNAP_PX, hovers: true };

/**
 * Wires pointer and keyboard interaction to the canvas: it recognizes each device's gestures and
 * asks the scope for what they mean through `actions.ts`. Returns a disposer.
 */
export function attachInput(canvas: HTMLCanvasElement, view: () => View): () => void {
  const actions = createActions({
    view,
    setCursor: (c) => {
      canvas.style.cursor = c;
    },
  });
  const detachKeyboard = attachKeyboard(actions);
  let rightDrag: { sx: number; sy: number; started: boolean; origin: RangeCursorOrigin } | null =
    null;
  let suppressClick = false;
  let suppressMenu = false;
  /** How exactly the pointer last pressed lands. */
  let precision = CURSOR;
  /** macOS fires contextmenu on mousedown; hold the menu until we know it was not a drag. */
  let heldMenu: Point | null = null;

  const touch = trackTouches({
    press: (e) => actions.grab(at(e), precision),
    longPress: (p) => {
      actions.dropGrab();
      suppressClick = true;
      actions.menu(p, precision);
    },
    zoomStart: () => {
      actions.dropGrab();
      actions.zoomStart();
    },
    zoom: actions.zoomTo,
    zoomEnd: () => {
      actions.zoomEnd();
      suppressClick = true;
    },
  });

  const onDown = (e: PointerEvent) => {
    precision = e.pointerType === 'mouse' ? CURSOR : precisionOf(e.pointerType);
    // A finger drag never ends in a click, so a suppression left over from one must not eat this tap.
    suppressClick = false;
    if (e.pointerType === 'mouse') {
      if (e.button === 2) {
        rightDrag = {
          sx: e.clientX,
          sy: e.clientY,
          started: false,
          origin: actions.rangeOrigin(at(e)),
        };
      } else if (e.button === 0) {
        actions.grab(at(e), precision);
        e.preventDefault();
      }
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    touch.down(e);
  };

  const onHover = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') actions.hover(at(e));
  };

  const onLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') actions.hover(null);
  };

  const onWindowMove = (e: PointerEvent) => {
    if (touch.move(e)) return;
    if (rightDrag && !rightDrag.started) {
      if (Math.hypot(e.clientX - rightDrag.sx, e.clientY - rightDrag.sy) > DRAG_THRESHOLD_PX) {
        rightDrag.started = true;
        actions.showRange(rightDrag.origin);
      }
    }
    actions.dragTo(at(e));
  };

  const onUp = (e: PointerEvent) => {
    if (touch.up(e)) return;
    if (e.pointerType === 'mouse' && e.button === 2 && rightDrag) {
      if (rightDrag.started) {
        suppressMenu = true;
        setTimeout(() => {
          suppressMenu = false;
        }, 50);
      }
      if (!rightDrag.started && heldMenu) actions.menu(heldMenu, precision);
      heldMenu = null;
      rightDrag = null;
      actions.showRange(null);
    }
    if (actions.release(at(e))) suppressClick = true;
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    actions.zoomBy(at(e), Math.exp(e.deltaY * ZOOM_PER_PX));
  };

  const onClick = (e: MouseEvent) => {
    actions.dismissMenu();
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    actions.tap(at(e), precision);
  };

  /** iOS shows its text magnifier when a double tap is held; a drag zoom is not a text gesture. */
  const onTouchStart = (e: TouchEvent) => {
    if (touch.zooming()) e.preventDefault();
  };

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    // A finger asks for the menu by long press, which the touch tracker already answers.
    if (suppressMenu || precision === FINGER) return;
    if (rightDrag && !rightDrag.started) {
      heldMenu = at(e);
      return;
    }
    actions.menu(at(e), precision);
  };

  /** A press anywhere outside an open menu closes it. */
  const onWindowDown = (e: PointerEvent) => {
    if (!(e.target instanceof Element) || !e.target.closest('[data-menu]')) actions.dismissMenu();
  };

  canvas.addEventListener('pointermove', onHover);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('contextmenu', onContextMenu);
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  window.addEventListener('pointermove', onWindowMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('pointerdown', onWindowDown);
  return () => {
    canvas.removeEventListener('pointermove', onHover);
    canvas.removeEventListener('pointerleave', onLeave);
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('click', onClick);
    canvas.removeEventListener('contextmenu', onContextMenu);
    canvas.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('pointermove', onWindowMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('pointerdown', onWindowDown);
    detachKeyboard();
  };
}
