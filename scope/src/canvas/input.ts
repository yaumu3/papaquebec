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
import { type Point, trackTouches } from './touch';

const DRAG_THRESHOLD_PX = 5;
/** Wheel sensitivity: one 100 px notch scales the range by about 1.2. */
const ZOOM_PER_PX = 0.0018;
/** Fingers are less precise than a cursor. */
const TOUCH_REACH_PX = 24;
/** An RBL end this close to a target snaps onto it, as the pending line already draws it. */
const RBL_SNAP_PX = 15;

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
  /** The view and range a pinch started from. */
  let pinchBase: { view: View; rangeNm: number } | null = null;
  let suppressClick = false;
  let suppressMenu = false;
  let lastPointerType = 'mouse';
  /** macOS fires contextmenu on mousedown; hold the menu until we know it was not a drag. */
  let heldMenu: Point | null = null;

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
  const startPrimary = (x: number, y: number, reach?: number) => {
    const v = view();
    const t = targetAt(v, x, y, reach);
    if (t) {
      rblDrag = { hex: t.hex, sx: x, sy: y, moved: false };
      return;
    }
    const hit = blockAt(v, x, y);
    const s = hit ? targetScreen(v, hit.hex) : null;
    if (hit && s) {
      blockDrag = {
        hex: hit.hex,
        grabX: x - (s.cx + hit.dx),
        grabY: y - (s.cy + hit.dy),
        sx: x,
        sy: y,
        moved: false,
      };
      return;
    }
    const p = pan();
    panDrag = { sx: x, sy: y, x: p.x, y: p.y, moved: false };
  };

  const touch = trackTouches({
    press: (e) => startPrimary(e.clientX, e.clientY, TOUCH_REACH_PX),
    longPress: (at) => {
      endDrags();
      suppressClick = true;
      openMenu(at.x, at.y);
    },
    pinchStart: () => {
      endDrags();
      pinchBase = { view: view(), rangeNm: settings.rangeNm };
    },
    pinch: (start, now) => {
      if (!pinchBase) return;
      const z = pinchZoom(pinchBase.view, pinchBase.rangeNm, start, now);
      setRange(z.rangeNm);
      setPan(z.pan);
    },
    pinchEnd: () => {
      pinchBase = null;
      suppressClick = true;
    },
  });

  const onDown = (e: PointerEvent) => {
    lastPointerType = e.pointerType;
    // A finger drag never ends in a click, so a suppression left over from one must not eat this tap.
    suppressClick = false;
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
        startPrimary(e.clientX, e.clientY);
        e.preventDefault();
      }
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    touch.down(e);
  };

  const onHover = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    setMouse({ cx: e.clientX, cy: e.clientY });
    const t = targetAt(view(), e.clientX, e.clientY);
    setHovered(t ? t.hex : null);
  };

  const onWindowMove = (e: PointerEvent) => {
    if (touch.move(e)) return;
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
        touch.cancelLongPress();
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
        touch.cancelLongPress();
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
        touch.cancelLongPress();
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
    if (touch.up(e)) return;
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
