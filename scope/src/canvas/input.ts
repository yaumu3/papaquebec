import { nearestCorner } from '../render/layout/labels';
import type { View } from '../render/protocol';
import { toWorld } from '../render/scene/view';
import {
  bumpSnapshot,
  pan,
  rblPending,
  rbls,
  setHintVisible,
  setHovered,
  setLabelDrag,
  setMenu,
  setModeText,
  setMouse,
  setPan,
  setRangeCursor,
  setRblPending,
  setRbls,
  setSelected,
  togglePanel,
} from '../state/scope';
import {
  cycle,
  setRange,
  setSettings,
  settings,
  stepRange,
  TRAIL_STEPS,
  VECTOR_STEPS,
} from '../state/settings';
import { trackStore } from '../state/tracks';
import { pinchZoom, zoomAbout } from './gestures';
import { blockAt, fixAt, rblAt, targetAt, targetScreen } from './hit';
import { rblMenu, scopeMenu, targetMenu } from './menus';
import { anchorFor, appendRbl } from './rbl';

const DRAG_THRESHOLD_PX = 5;
/** Wheel sensitivity: one 100 px notch scales the range by about 1.2. */
const ZOOM_PER_PX = 0.0018;
/** A finger held still this long opens the menu a right click would. */
const LONG_PRESS_MS = 450;
/** Fingers are less precise than a cursor. */
const TOUCH_REACH_PX = 24;
/** An RBL end this close to a target snaps onto it, as the pending line already draws it. */
const RBL_SNAP_PX = 15;

interface Point {
  x: number;
  y: number;
}

/** The RBL anchor under a screen point: a target within `reach`, else the point itself. */
function anchorAt(v: View, cx: number, cy: number, reach: number) {
  return anchorFor(targetAt(v, cx, cy, reach), toWorld(v, cx, cy));
}

function onKey(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement) return;
  switch (e.key) {
    case 'Escape':
      setRblPending(null);
      setRangeCursor(null);
      setModeText(null);
      setMenu(null);
      break;
    case '?':
      setHintVisible((v) => !v);
      break;
    case '[':
      stepRange(-1);
      break;
    case ']':
      stepRange(1);
      break;
    case 't':
    case 'T':
      setSettings('trailSec', cycle(TRAIL_STEPS, settings.trailSec));
      break;
    case 'v':
    case 'V':
      setSettings('vectorMin', cycle(VECTOR_STEPS, settings.vectorMin));
      break;
    case 'l':
    case 'L':
      togglePanel('list');
      break;
    case 'r':
    case 'R':
      setRblPending({ a: null });
      setModeText('RBL · SELECT ANCHOR A');
      break;
    case 'Home':
      setPan({ x: 0, y: 0 });
      break;
    case 'Delete':
    case 'Backspace':
      setRbls(e.shiftKey ? [] : rbls().slice(0, -1));
      break;
  }
}

function onLeave(e: PointerEvent) {
  if (e.pointerType !== 'mouse') return;
  setMouse(null);
  setHovered(null);
}

function onWindowDown(e: PointerEvent) {
  if (!(e.target instanceof Element) || !e.target.closest('[data-menu]')) setMenu(null);
}

/**
 * Wires pointer and keyboard interaction to the canvas. A mouse gets hover, left-drag pan,
 * block drag, right-drag range cursor, wheel zoom and the context menu; a finger gets drag pan,
 * block drag, pinch zoom, tap and long-press. Returns a disposer.
 */
export function attachInput(canvas: HTMLCanvasElement, view: () => View): () => void {
  let rightDrag: {
    sx: number;
    sy: number;
    started: boolean;
    origin: Parameters<typeof setRangeCursor>[0];
  } | null = null;
  let panDrag: { sx: number; sy: number; x: number; y: number; moved: boolean } | null = null;
  let blockDrag: {
    hex: string;
    grabX: number;
    grabY: number;
    sx: number;
    sy: number;
    moved: boolean;
  } | null = null;
  /** A drag that began on a target; once it moves it is a pending RBL anchored there. */
  let rblDrag: { hex: string; sx: number; sy: number; moved: boolean } | null = null;
  /** Fingers on the canvas by pointer id, and the pinch they started when there are two. */
  const fingers = new Map<number, Point>();
  let pinch: { view: View; rangeNm: number; start: [Point, Point]; ids: [number, number] } | null =
    null;
  let longPress: ReturnType<typeof setTimeout> | null = null;
  let suppressClick = false;
  let suppressMenu = false;
  let lastPointerType = 'mouse';
  /** macOS fires contextmenu on mousedown; hold the menu until we know it was not a drag. */
  let heldMenu: Point | null = null;

  const cancelLongPress = () => {
    if (longPress) clearTimeout(longPress);
    longPress = null;
  };
  const endDrags = () => {
    panDrag = null;
    blockDrag = null;
    if (rblDrag?.moved) {
      setRblPending(null);
      setModeText(null);
    }
    rblDrag = null;
    setLabelDrag(null);
    canvas.style.cursor = 'crosshair';
  };

  const openMenu = (x: number, y: number) => {
    const v = view();
    const t = targetAt(v, x, y, lastPointerType === 'touch' ? TOUCH_REACH_PX : undefined);
    const r = t ? null : rblAt(v, x, y);
    setMenu({ x, y, items: t ? targetMenu(t) : r ? rblMenu(r) : scopeMenu(toWorld(v, x, y)) });
  };

  /** Left button or first finger: drag an RBL off a target, grab a data block, else start panning. */
  const startPrimary = (e: PointerEvent) => {
    const v = view();
    const reach = e.pointerType === 'touch' ? TOUCH_REACH_PX : undefined;
    const t = targetAt(v, e.clientX, e.clientY, reach);
    if (t) {
      rblDrag = { hex: t.hex, sx: e.clientX, sy: e.clientY, moved: false };
      return;
    }
    const hit = blockAt(v, e.clientX, e.clientY);
    const s = hit ? targetScreen(v, hit.hex) : null;
    if (hit && s) {
      blockDrag = {
        hex: hit.hex,
        grabX: e.clientX - (s.cx + hit.dx),
        grabY: e.clientY - (s.cy + hit.dy),
        sx: e.clientX,
        sy: e.clientY,
        moved: false,
      };
      return;
    }
    const p = pan();
    panDrag = { sx: e.clientX, sy: e.clientY, x: p.x, y: p.y, moved: false };
  };

  const onDown = (e: PointerEvent) => {
    lastPointerType = e.pointerType;
    if (e.pointerType === 'mouse') {
      if (e.button === 2) {
        const v = view();
        const t = targetAt(v, e.clientX, e.clientY);
        const fix = t ? null : fixAt(v, e.clientX, e.clientY);
        const w = toWorld(v, e.clientX, e.clientY);
        const origin = t
          ? { kind: 'target' as const, hex: t.hex }
          : fix
            ? { kind: 'fix' as const, ...fix }
            : { kind: 'free' as const, ...w };
        rightDrag = { sx: e.clientX, sy: e.clientY, started: false, origin };
      } else if (e.button === 0) {
        startPrimary(e);
        e.preventDefault();
      }
      return;
    }
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (fingers.size === 1) {
      startPrimary(e);
      cancelLongPress();
      longPress = setTimeout(() => {
        longPress = null;
        endDrags();
        suppressClick = true;
        openMenu(e.clientX, e.clientY);
      }, LONG_PRESS_MS);
    } else if (fingers.size === 2) {
      cancelLongPress();
      endDrags();
      const [a, b] = [...fingers.entries()];
      if (a && b) {
        pinch = {
          view: view(),
          rangeNm: settings.rangeNm,
          start: [{ ...a[1] }, { ...b[1] }],
          ids: [a[0], b[0]],
        };
      }
    }
  };

  const onHover = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    setMouse({ cx: e.clientX, cy: e.clientY });
    const t = targetAt(view(), e.clientX, e.clientY);
    setHovered(t ? t.hex : null);
  };

  const onWindowMove = (e: PointerEvent) => {
    if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) {
      const a = fingers.get(pinch.ids[0]);
      const b = fingers.get(pinch.ids[1]);
      if (a && b) {
        const z = pinchZoom(pinch.view, pinch.rangeNm, pinch.start, [a, b]);
        setRange(z.rangeNm);
        setPan(z.pan);
      }
      return;
    }
    if (rightDrag && !rightDrag.started) {
      if (Math.hypot(e.clientX - rightDrag.sx, e.clientY - rightDrag.sy) > DRAG_THRESHOLD_PX) {
        rightDrag.started = true;
        setRangeCursor(rightDrag.origin);
      }
    }
    if (rblDrag) {
      if (
        !rblDrag.moved &&
        Math.hypot(e.clientX - rblDrag.sx, e.clientY - rblDrag.sy) > DRAG_THRESHOLD_PX
      ) {
        rblDrag.moved = true;
        cancelLongPress();
        setRblPending({ a: { kind: 'target', hex: rblDrag.hex } });
        setModeText('RBL · RELEASE ON ANCHOR B');
      }
      if (rblDrag.moved) setMouse({ cx: e.clientX, cy: e.clientY });
    }
    if (blockDrag) {
      if (
        !blockDrag.moved &&
        Math.hypot(e.clientX - blockDrag.sx, e.clientY - blockDrag.sy) > DRAG_THRESHOLD_PX
      ) {
        blockDrag.moved = true;
        cancelLongPress();
        canvas.style.cursor = 'grabbing';
      }
      const s = blockDrag.moved ? targetScreen(view(), blockDrag.hex) : null;
      if (s) {
        setLabelDrag({
          hex: blockDrag.hex,
          dx: e.clientX - blockDrag.grabX - s.cx,
          dy: e.clientY - blockDrag.grabY - s.cy,
        });
      }
    }
    if (panDrag) {
      if (
        !panDrag.moved &&
        Math.hypot(e.clientX - panDrag.sx, e.clientY - panDrag.sy) > DRAG_THRESHOLD_PX
      ) {
        panDrag.moved = true;
        cancelLongPress();
        canvas.style.cursor = 'move';
      }
      if (!panDrag.moved) return;
      const k = view().pxPerNm;
      setPan({
        x: panDrag.x - (e.clientX - panDrag.sx) / k,
        y: panDrag.y + (e.clientY - panDrag.sy) / k,
      });
    }
  };

  const onUp = (e: PointerEvent) => {
    if (fingers.delete(e.pointerId)) {
      cancelLongPress();
      if (pinch) {
        if (fingers.size < 2) {
          pinch = null;
          suppressClick = true;
        }
        return;
      }
    }
    if (e.pointerType === 'mouse' && e.button === 2 && rightDrag) {
      if (rightDrag.started) {
        suppressMenu = true;
        setTimeout(() => {
          suppressMenu = false;
        }, 50);
      }
      if (!rightDrag.started && heldMenu) openMenu(heldMenu.x, heldMenu.y);
      heldMenu = null;
      rightDrag = null;
      setRangeCursor(null);
    }
    if (panDrag) {
      if (panDrag.moved) suppressClick = true;
      panDrag = null;
      canvas.style.cursor = 'crosshair';
    }
    if (rblDrag) {
      const drag = rblDrag;
      rblDrag = null;
      if (drag.moved) {
        suppressClick = true;
        // Escape mid-drag clears the pending anchor, and with it the line.
        const a = rblPending()?.a;
        if (a) {
          const reach = e.pointerType === 'touch' ? TOUCH_REACH_PX : RBL_SNAP_PX;
          setRbls(appendRbl(rbls(), a, anchorAt(view(), e.clientX, e.clientY, reach)));
        }
        setRblPending(null);
        setModeText(null);
        if (e.pointerType !== 'mouse') setMouse(null);
      }
    }
    if (blockDrag) {
      const drag = blockDrag;
      blockDrag = null;
      canvas.style.cursor = 'crosshair';
      const s = targetScreen(view(), drag.hex);
      const t = trackStore.tracks.get(drag.hex);
      if (drag.moved && s && t) {
        t.ops.pinnedCorner = nearestCorner(
          e.clientX - drag.grabX - s.cx,
          e.clientY - drag.grabY - s.cy,
        );
        suppressClick = true;
        bumpSnapshot();
      }
      setLabelDrag(null);
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const z = zoomAbout(
      view(),
      settings.rangeNm,
      e.clientX,
      e.clientY,
      Math.exp(e.deltaY * ZOOM_PER_PX),
    );
    if (z.rangeNm === settings.rangeNm) return;
    setRange(z.rangeNm);
    setPan(z.pan);
  };

  const onClick = (e: MouseEvent) => {
    setMenu(null);
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const v = view();
    const reach = lastPointerType === 'touch' ? TOUCH_REACH_PX : undefined;
    const pending = rblPending();
    if (pending) {
      const anchor = anchorAt(v, e.clientX, e.clientY, reach ?? RBL_SNAP_PX);
      if (!pending.a) {
        setRblPending({ a: anchor });
        setModeText('RBL · SELECT ANCHOR B');
      } else {
        setRbls(appendRbl(rbls(), pending.a, anchor));
        setRblPending(null);
        setModeText(null);
      }
      return;
    }
    const t = targetAt(v, e.clientX, e.clientY, reach);
    setSelected(t ? t.hex : (blockAt(v, e.clientX, e.clientY)?.hex ?? null));
  };

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    if (suppressMenu || lastPointerType === 'touch') return;
    if (rightDrag && !rightDrag.started) {
      heldMenu = { x: e.clientX, y: e.clientY };
      return;
    }
    openMenu(e.clientX, e.clientY);
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
  window.addEventListener('keydown', onKey);
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
    window.removeEventListener('keydown', onKey);
  };
}
