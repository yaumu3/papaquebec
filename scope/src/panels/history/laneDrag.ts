import { type Accessor, createSignal, onCleanup } from 'solid-js';

import type { LaneKey } from '../../state/plotted';
import { edgeSpeed, slotAt } from '../../ui/reorder';
import { dropOf, overBin } from './drag';
import { axisOf } from './swipe';

/** How far a pointer travels from where it took hold of a lane's top row before it drags the lane. */
const SLOP_PX = 4;

/** A lane dragged by its top row: where it came from, the slot it is over, and the pointer. */
export interface LaneDrag {
  lane: LaneKey;
  from: number;
  slot: number;
  overBin: boolean;
  /** The pointer, CSS px in the viewport, and how far right of the row's left it took hold. */
  x: number;
  y: number;
  grabX: number;
}

/**
 * The drag of lanes by their top rows, `pitch` apart down `scroller`: the slot under the pointer
 * as it moves, the view scrolling near its edges, and over `bin` the lane's removal. Esc, or the
 * pointer lost, cancels.
 */
export function createLaneDrag(deps: {
  scroller: () => HTMLElement | undefined;
  bin: () => HTMLElement | undefined;
  pitch: number;
  lanes: () => readonly LaneKey[];
  onDrop: (lane: LaneKey, drop: ReturnType<typeof dropOf>) => void;
}): { drag: Accessor<LaneDrag | null>; grab: (e: PointerEvent, lane: LaneKey) => void } {
  const [drag, setDrag] = createSignal<LaneDrag | null>(null);
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

  const grab = (e: PointerEvent, lane: LaneKey) => {
    const row = e.currentTarget;
    if (e.button !== 0 || !(row instanceof HTMLElement)) return;
    if (e.target instanceof Element && e.target.closest('button')) return;
    end?.();
    row.setPointerCapture(e.pointerId);
    const from = deps.lanes().indexOf(lane);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const grabX = x0 - row.getBoundingClientRect().left;
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
    const onMove = (m: PointerEvent) => {
      const d = drag();
      if (d) {
        setDrag(at(d, m.clientX, m.clientY));
        return;
      }
      if (axisOf(m.clientX - x0, m.clientY - y0, SLOP_PX) === null) return;
      setDrag(
        at({ lane, from, slot: from, overBin: false, x: x0, y: y0, grabX }, m.clientX, m.clientY),
      );
      window.addEventListener('keydown', onKey, { capture: true });
      frame = requestAnimationFrame(scroll);
    };
    const onUp = () => {
      const d = drag();
      end?.();
      if (d) deps.onDrop(d.lane, dropOf(d.from, d.slot, d.overBin));
    };
    const onKey = (k: KeyboardEvent) => {
      if (k.key !== 'Escape') return;
      k.preventDefault();
      k.stopPropagation();
      end?.();
    };
    const cancel = () => end?.();
    row.addEventListener('pointermove', onMove);
    row.addEventListener('pointerup', onUp);
    row.addEventListener('pointercancel', cancel);
    row.addEventListener('lostpointercapture', cancel);
    end = () => {
      end = null;
      cancelAnimationFrame(frame);
      row.removeEventListener('pointermove', onMove);
      row.removeEventListener('pointerup', onUp);
      row.removeEventListener('pointercancel', cancel);
      row.removeEventListener('lostpointercapture', cancel);
      window.removeEventListener('keydown', onKey, { capture: true });
      if (row.hasPointerCapture(e.pointerId)) row.releasePointerCapture(e.pointerId);
      setDrag(null);
    };
  };

  return { drag, grab };
}
