import { type Accessor, createSignal, onCleanup } from 'solid-js';

import type { LaneKey } from '../../state/plotted';
import { edgeSpeed, slotAt } from '../../ui/reorder';
import { dropOf, overBin } from './drag';
import { axisOf, gestureOf, swipeRemoves } from './swipe';

/** How far a pointer travels from where it took hold of a lane before it drags the lane. */
const SLOP_PX = 4;

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
 * cancels. A finger drags a lane by its top row only; moving sideways there it swipes the row
 * instead, which removes the lane past a third of its width.
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
  grab: (e: PointerEvent, lane: LaneKey, part: LanePart) => void;
} {
  const [drag, setDrag] = createSignal<LaneDrag | null>(null);
  const [swipe, setSwipe] = createSignal<LaneSwipe | null>(null);
  let end: (() => void) | null = null;
  onCleanup(() => end?.());

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
    if (part === 'plot' && e.pointerType === 'touch') return;
    end?.();
    el.setPointerCapture(e.pointerId);
    const from = deps.lanes().indexOf(lane);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const grabX = x0 - el.getBoundingClientRect().left;
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
      setDrag(at({ lane, from, slot: from, overBin: false, x: x0, y: y0, grabX }, x, y));
      window.addEventListener('keydown', onKey, { capture: true });
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
      const dx = m.clientX - x0;
      const gesture = gestureOf(m.pointerType, axisOf(dx, m.clientY - y0, SLOP_PX));
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
      if (k.key !== 'Escape') return;
      k.preventDefault();
      k.stopPropagation();
      end?.();
    };
    const cancel = () => end?.();
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('lostpointercapture', cancel);
    end = () => {
      end = null;
      cancelAnimationFrame(frame);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('lostpointercapture', cancel);
      window.removeEventListener('keydown', onKey, { capture: true });
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      setDrag(null);
      setSwipe(null);
    };
  };

  return { drag, swipe, grab };
}
