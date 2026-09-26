import type { View } from '../../render/protocol';
import type { RangeCursorOrigin } from '../../state/scope';
import { RBL_SNAP_PX, TARGET_PX } from '../hit';
import { createActions, type Precision } from './actions';
import { attachKeyboard } from './devices/keyboard';
import { attachTouch } from './devices/touch';
import { at } from './dom';
import { DRAG_THRESHOLD_PX, type Point } from './geometry';

/** Wheel sensitivity: one 100 px notch scales the range by about 1.2. */
const ZOOM_PER_PX = 0.0018;
/** A mouse cursor lands exactly and shows where it is between presses. */
const CURSOR: Precision = { reach: TARGET_PX, snap: RBL_SNAP_PX, hovers: true };

const isMouse = (e: PointerEvent) => e.pointerType === 'mouse';

/**
 * Wires input to the canvas: the keyboard and touch have their own device modules; the mouse's
 * gestures are recognized here. All of them ask the scope through `actions.ts`. Returns a disposer.
 */
export function attachInput(canvas: HTMLCanvasElement, view: () => View): () => void {
  const actions = createActions({
    view,
    setCursor: (c) => {
      canvas.style.cursor = c;
    },
  });
  const detachKeyboard = attachKeyboard(actions);
  const detachTouch = attachTouch(canvas, actions);
  let rightDrag: { sx: number; sy: number; started: boolean; origin: RangeCursorOrigin } | null =
    null;
  let suppressClick = false;
  let suppressMenu = false;
  /** The kind of pointer that pressed last; touch taps are the touch device's, not the click's. */
  let lastPointerType = 'mouse';
  /** macOS fires contextmenu on mousedown; hold the menu until we know it was not a drag. */
  let heldMenu: Point | null = null;

  const onDown = (e: PointerEvent) => {
    lastPointerType = e.pointerType;
    if (!isMouse(e)) return;
    suppressClick = false;
    if (e.button === 2) {
      rightDrag = {
        sx: e.clientX,
        sy: e.clientY,
        started: false,
        origin: actions.rangeOrigin(at(e)),
      };
    } else if (e.button === 0) {
      actions.grab(at(e), CURSOR);
      e.preventDefault();
    }
  };

  const onHover = (e: PointerEvent) => {
    if (isMouse(e)) actions.hover(at(e));
  };

  const onLeave = (e: PointerEvent) => {
    if (isMouse(e)) actions.hover(null);
  };

  const onWindowMove = (e: PointerEvent) => {
    if (!isMouse(e)) return;
    if (rightDrag && !rightDrag.started) {
      if (Math.hypot(e.clientX - rightDrag.sx, e.clientY - rightDrag.sy) > DRAG_THRESHOLD_PX) {
        rightDrag.started = true;
        actions.showRange(rightDrag.origin);
      }
    }
    actions.dragTo(at(e));
  };

  const onUp = (e: PointerEvent) => {
    if (!isMouse(e)) return;
    if (e.button === 2 && rightDrag) {
      if (rightDrag.started) {
        suppressMenu = true;
        setTimeout(() => {
          suppressMenu = false;
        }, 50);
      }
      if (!rightDrag.started && heldMenu) actions.menu(heldMenu, CURSOR);
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
    if (lastPointerType !== 'mouse') return;
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    actions.tap(at(e), CURSOR);
  };

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    // A finger asks for the menu by long press, which the touch device already answers.
    if (suppressMenu || lastPointerType === 'touch') return;
    if (rightDrag && !rightDrag.started) {
      heldMenu = at(e);
      return;
    }
    actions.menu(at(e), CURSOR);
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
    window.removeEventListener('pointermove', onWindowMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('pointerdown', onWindowDown);
    detachTouch();
    detachKeyboard();
  };
}
