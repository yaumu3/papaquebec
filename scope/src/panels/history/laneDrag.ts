import { type Accessor, createEffect, createSignal, onCleanup } from 'solid-js';

import type { LaneKey } from '../../state/plotted';
import { edgeSpeed, slotAt } from '../../ui/reorder';
import { dragKeyOf, dropOf, overBin } from './drag';
import { HOLD_MS, plotGestureOf } from './hold';
import { axisOf, gestureOf, swipeRemoves } from './swipe';

/** How far a pointer travels from where it took hold of a lane before it drags the lane. */
const SLOP_PX = 4;

/** Keeps a press from opening the page's menu, as a long one does. */
const noMenu = (e: Event) => e.preventDefault();

/** Where on a lane a pointer took hold of it: its top row, or the plot under it. */
export type LanePart = 'row' | 'plot';

/** A lane dragged: where it came from, the slot it is over, and the pointer. */
export interface LaneDrag {
  lane: LaneKey;
  from: number;
  slot: number;
  overBin: boolean;
  /** The pointer, CSS px in the viewport, and how far right of the lane's left it took hold. */
  x: number;
  y: number;
  grabX: number;
}

/** A lane's top row swiped by a finger `dx` across, the lane `width` wide. */
export interface LaneSwipe {
  lane: LaneKey;
  dx: number;
  width: number;
}

/**
 * The drag of lanes, `pitch` apart down `scroller`: the slot under the pointer as it moves, the
 * view scrolling near its edges, and over `bin` the lane's removal. Esc, or the pointer lost,
 * cancels. A finger drags a lane by its top row, or by its plot once held there; moving sideways
 * on the row it swipes the row instead, which removes the lane past a third of its width.
 */
export function createLaneDrag(deps: {
  scroller: () => HTMLElement | undefined;
  bin: () => HTMLElement | undefined;
  pitch: number;
  lanes: () => readonly LaneKey[];
  onDrop: (lane: LaneKey, drop: ReturnType<typeof dropOf>) => void;
}): {
  drag: Accessor<LaneDrag | null>;
  swipe: Accessor<LaneSwipe | null>;
  /** Whether a finger rests on a lane's plot, not yet holding it long enough to pick it up. */
  holding: Accessor<boolean>;
  grab: (e: PointerEvent, lane: LaneKey, part: LanePart) => void;
} {
  const [drag, setDrag] = createSignal<LaneDrag | null>(null);
  const [swipe, setSwipe] = createSignal<LaneSwipe | null>(null);
  const [holding, setHolding] = createSignal(false);
  let end: (() => void) | null = null;
  /** The lane a pointer has taken hold of, until it lets go. */
  let held: LaneKey | null = null;
  onCleanup(() => end?.());
  // A lane removed some other way takes the gesture on it with it.
  createEffect(() => {
    const lanes = deps.lanes();
    if (held !== null && !lanes.includes(held)) end?.();
  });
  /**
   * Keeps a finger's moves over the lanes from the page: from scrolling them while it drags one,
   * and from the sheet while it drags or rests on a plot.
   */
  const keep = (t: TouchEvent) => {
    if (drag()) t.preventDefault();
    if (drag() || holding()) t.stopPropagation();
  };
  // Listening before a finger lands, so that the page waits for it before it scrolls.
  createEffect(() => {
    const sc = deps.scroller();
    if (!sc) return;
    sc.addEventListener('touchmove', keep, { passive: false });
    onCleanup(() => sc.removeEventListener('touchmove', keep));
  });

  /** The drag with the slot and the bin read again at the pointer `x`, `y`. */
  const at = (d: LaneDrag, x: number, y: number): LaneDrag => {
    const sc = deps.scroller()?.getBoundingClientRect();
    const top = deps.scroller()?.scrollTop ?? 0;
    const bin = deps.bin()?.getBoundingClientRect();
    if (!sc) return { ...d, x, y };
    const slot = slotAt(y - sc.top + top, deps.pitch, deps.lanes().length);
    return { ...d, x, y, slot, overBin: !!bin && overBin(x, y, bin, sc) };
  };

  const grab = (e: PointerEvent, lane: LaneKey, part: LanePart) => {
    const el = e.currentTarget;
    if (e.button !== 0 || !(el instanceof HTMLElement)) return;
    if (e.target instanceof Element && e.target.closest('button')) return;
    end?.();
    held = lane;
    el.setPointerCapture(e.pointerId);
    const from = deps.lanes().indexOf(lane);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const grabX = x0 - el.getBoundingClientRect().left;
    /** Where the pointer last was. */
    let last = { x: x0, y: y0 };
    let frame = 0;
    const scroll = () => {
      const d = drag();
      const sc = deps.scroller();
      if (d && sc) {
        const r = sc.getBoundingClientRect();
        const speed = edgeSpeed(d.y, r.top, r.bottom);
        if (speed !== 0) {
          sc.scrollTop += speed;
          setDrag(at(d, d.x, d.y));
        }
      }
      frame = requestAnimationFrame(scroll);
    };
    /** Picks the lane up, the pointer at `x`, `y`. */
    const pickUp = (x: number, y: number) => {
      setHolding(false);
      setDrag(at({ lane, from, slot: from, overBin: false, x: x0, y: y0, grabX }, x, y));
      frame = requestAnimationFrame(scroll);
    };
    const onMove = (m: PointerEvent) => {
      const d = drag();
      const s = swipe();
      if (d) {
        setDrag(at(d, m.clientX, m.clientY));
        return;
      }
      if (s) {
        setSwipe({ ...s, dx: m.clientX - x0 });
        return;
      }
      last = { x: m.clientX, y: m.clientY };
      const dx = m.clientX - x0;
      const dy = m.clientY - y0;
      if (part === 'plot') {
        const g = plotGestureOf(m.pointerType, dx, dy, m.timeStamp - e.timeStamp, SLOP_PX);
        if (g === 'pass') end?.();
        if (g === 'drag') pickUp(m.clientX, m.clientY);
        return;
      }
      const gesture = gestureOf(m.pointerType, axisOf(dx, dy, SLOP_PX));
      if (gesture === 'swipe') setSwipe({ lane, dx, width: el.getBoundingClientRect().width });
      if (gesture === 'drag') pickUp(m.clientX, m.clientY);
    };
    const onUp = () => {
      const d = drag();
      const s = swipe();
      end?.();
      if (d) deps.onDrop(d.lane, dropOf(d.from, d.slot, d.overBin));
      else if (s && swipeRemoves(s.dx, s.width)) deps.onDrop(s.lane, 'remove');
    };
    const onKey = (k: KeyboardEvent) => {
      k.preventDefault();
      k.stopPropagation();
      if (dragKeyOf(k.key) === 'cancel') end?.();
    };
    const cancel = () => end?.();
    const touchPlot = part === 'plot' && e.pointerType === 'touch';
    setHolding(touchPlot);
    const hold = touchPlot
      ? setTimeout(() => {
          const g = plotGestureOf(e.pointerType, last.x - x0, last.y - y0, HOLD_MS, SLOP_PX);
          if (!drag() && g === 'drag') pickUp(last.x, last.y);
        }, HOLD_MS)
      : undefined;
    window.addEventListener('keydown', onKey, { capture: true });
    el.addEventListener('contextmenu', noMenu);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('lostpointercapture', cancel);
    end = () => {
      end = null;
      held = null;
      clearTimeout(hold);
      cancelAnimationFrame(frame);
      el.removeEventListener('contextmenu', noMenu);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('lostpointercapture', cancel);
      window.removeEventListener('keydown', onKey, { capture: true });
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      setDrag(null);
      setSwipe(null);
      setHolding(false);
    };
  };

  return { drag, swipe, holding, grab };
}
