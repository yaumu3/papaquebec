import { type Accessor, createEffect, createSignal, onCleanup } from 'solid-js';

import type { LaneKey } from '../../state/plotted';
import { edgeSpeed, slotAt } from '../../ui/reorder';
import { dragKeyOf, dropOf, overBin } from './drag';
import {
  HOLD_MS,
  keepsTouch,
  laneGestureOf,
  PICKER_HOLD_MS,
  pinchesFrom,
  type Tap,
  type TouchFlags,
  type TouchStage,
  touchHoldOf,
} from './hold';
import { swipeRemoves } from './swipe';

/** How far a pointer travels from where it took hold of a lane before it drags the lane. */
const SLOP_PX = 4;

/** Where on a lane a pointer took hold of it: a history lane's top row or its plot, or an instrument. */
export type LanePart = 'row' | 'plot' | 'instrument';

/** A lane dragged: where it came from, the slot it is over, and the pointer. */
interface LaneDrag {
  lane: LaneKey;
  from: number;
  slot: number;
  overBin: boolean;
  /** Whether a finger has lifted the lane and not moved it past the slop yet: lit where it stands. */
  still: boolean;
  /** The pointer, CSS px in the viewport, and how far right of the lane's left it took hold. */
  x: number;
  y: number;
  grabX: number;
}

/** A lane's top row swiped by a finger `dx` across, the lane `width` wide. */
interface LaneSwipe {
  lane: LaneKey;
  dx: number;
  width: number;
}

/**
 * The drag of lanes stacked down `scroller`, each as tall as `heights` has it: the slot under the
 * pointer as it moves, the view scrolling near its edges, and over `bin` the lane's removal. Esc,
 * or the pointer lost, cancels. A finger lifts a lane once held on it, drags it once it moves, and
 * held still for longer opens its picker; moving sideways first on the top row it swipes the row
 * instead, which removes the lane past a third of its width.
 */
export function createLaneDrag(deps: {
  scroller: () => HTMLElement | undefined;
  bin: () => HTMLElement | undefined;
  /** Each lane's height, in the order they stand. */
  heights: () => readonly number[];
  lanes: () => readonly LaneKey[];
  /** The picker a finger's hold opens at the finger, and closes again when the finger drags. */
  picker: {
    open: (lane: LaneKey, el: HTMLElement, x: number, y: number) => void;
    close: () => void;
  };
  onDrop: (lane: LaneKey, drop: ReturnType<typeof dropOf>) => void;
  /** A finger's tap on a history lane: pressed and released with no gesture, in viewport px and ms. */
  onTap: (tap: Tap) => void;
  /** Puts the cursor at a viewport x, for a finger peeking along a plot or a mouse selecting a span. */
  cursorTo: (x: number) => void;
  /** What a finger's peek ends with. */
  peek: { end: () => void };
  /** The span a mouse selects by dragging sideways on a history lane, in viewport x. */
  select: { start: (x: number) => void; end: () => void; cancel: () => void };
}): {
  drag: Accessor<LaneDrag | null>;
  swipe: Accessor<LaneSwipe | null>;
  /** Whether a finger moved sideways along a plot is carrying the cursor. */
  peeking: Accessor<boolean>;
  /** Whether a second finger landing now pinches the window. */
  pinchable: () => boolean;
  /** Ends the gesture on the lane without effect: no drop, no removal. */
  abandon: () => void;
  grab: (e: PointerEvent, lane: LaneKey, part: LanePart) => void;
} {
  const [drag, setDrag] = createSignal<LaneDrag | null>(null);
  const [swipe, setSwipe] = createSignal<LaneSwipe | null>(null);
  /** Whether a finger rests on a lane, not yet holding it long enough to pick it up. */
  const [holding, setHolding] = createSignal(false);
  /** Whether a finger's hold has opened the picker, which it still owns until it lifts. */
  const [picking, setPicking] = createSignal(false);
  /** Whether a finger moved sideways along a plot is carrying the cursor. */
  const [peeking, setPeeking] = createSignal(false);
  let end: (() => void) | null = null;
  /** The lane a pointer has grabbed, and where on it, until it lets go. */
  let grabbed: LaneKey | null = null;
  let grabbedPart: LanePart | null = null;
  onCleanup(() => end?.());
  // A lane removed some other way takes the gesture on it with it.
  createEffect(() => {
    const lanes = deps.lanes();
    if (grabbed !== null && !lanes.includes(grabbed)) end?.();
  });
  /** What the finger on the lanes is doing. */
  const flags = (): TouchFlags => ({
    drag: !!drag(),
    swipe: !!swipe(),
    holding: holding(),
    picking: picking(),
    peeking: peeking(),
  });
  /**
   * Keeps a finger's moves over the lanes from the page: from scrolling them while it drags or
   * swipes one, and from the sheet while it also rests on one.
   */
  const keep = (t: TouchEvent) => {
    const kept = keepsTouch(flags());
    if (kept.prevent) t.preventDefault();
    if (kept.stop) t.stopPropagation();
  };
  /** Reads a dragged lane's slot again as the lanes scroll under a still pointer. */
  const reread = () => {
    const d = drag();
    if (d) setDrag(at(d, d.x, d.y));
  };
  // Listening before a finger lands, so that the page waits for it before it scrolls.
  createEffect(() => {
    const sc = deps.scroller();
    if (!sc) return;
    const ac = new AbortController();
    sc.addEventListener('touchmove', keep, { passive: false, signal: ac.signal });
    sc.addEventListener('scroll', reread, { signal: ac.signal });
    onCleanup(() => ac.abort());
  });

  /** The drag with the slot and the bin read again at the pointer `x`, `y`. */
  const at = (d: LaneDrag, x: number, y: number): LaneDrag => {
    const sc = deps.scroller()?.getBoundingClientRect();
    const top = deps.scroller()?.scrollTop ?? 0;
    const bin = deps.bin()?.getBoundingClientRect();
    if (!sc) return { ...d, x, y };
    const slot = slotAt(y - sc.top + top, deps.heights());
    return { ...d, x, y, slot, overBin: !!bin && overBin(x, y, bin, sc) };
  };

  const grab = (e: PointerEvent, lane: LaneKey, part: LanePart) => {
    const el = e.currentTarget;
    if (e.button !== 0 || !(el instanceof HTMLElement)) return;
    if (e.target instanceof Element && e.target.closest('button')) return;
    // A lane is the first pointer's: another finger's press is left alone.
    if (!e.isPrimary) return;
    end?.();
    grabbed = lane;
    grabbedPart = part;
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
    /** Whether the pointer is selecting a span. */
    let selecting = false;
    /** Where a finger's hold has got to. */
    let stage: TouchStage = 'pressed';
    /** Picks the lane up, the pointer at `x`, `y`: lit where it stands while a finger has not moved it. */
    const pickUp = (x: number, y: number, still = false) => {
      setHolding(false);
      setDrag(at({ lane, from, slot: from, overBin: false, still, x: x0, y: y0, grabX }, x, y));
      frame = requestAnimationFrame(scroll);
    };
    /** Ends the lift in place and opens the picker at the finger. */
    const openPicker = () => {
      if (!drag()?.still) return;
      stage = 'picker';
      setPicking(true);
      cancelAnimationFrame(frame);
      setDrag(null);
      deps.picker.open(lane, el, last.x, last.y);
    };
    /** Whether an event is the pointer's that took hold of the lane. */
    const own = (p: PointerEvent) => p.pointerId === e.pointerId;
    const onMove = (m: PointerEvent) => {
      if (!own(m)) return;
      const d = drag();
      const s = swipe();
      const dx = m.clientX - x0;
      const dy = m.clientY - y0;
      if (stage === 'picker') {
        if (touchHoldOf(stage, part, dx, dy, m.timeStamp - e.timeStamp) !== 'drag') return;
        deps.picker.close();
        setPicking(false);
        stage = 'lifted';
        pickUp(m.clientX, m.clientY);
        return;
      }
      if (selecting || peeking()) {
        deps.cursorTo(m.clientX);
        return;
      }
      if (d) {
        if (d.still && touchHoldOf('lifted', part, dx, dy, m.timeStamp - e.timeStamp) !== 'drag')
          return;
        setDrag({ ...at(d, m.clientX, m.clientY), still: false });
        return;
      }
      if (s) {
        setSwipe({ ...s, dx: m.clientX - x0 });
        return;
      }
      last = { x: m.clientX, y: m.clientY };
      const g = laneGestureOf(part, m.pointerType, dx, dy, m.timeStamp - e.timeStamp, SLOP_PX);
      if (g === 'pass') end?.();
      if (g === 'swipe') {
        setHolding(false);
        setSwipe({ lane, dx, width: el.getBoundingClientRect().width });
      }
      if (g === 'drag') pickUp(m.clientX, m.clientY);
      if (g === 'peek') {
        setHolding(false);
        clearTimeout(lift);
        clearTimeout(picker);
        setPeeking(true);
        deps.cursorTo(m.clientX);
      }
      if (g === 'select') {
        selecting = true;
        deps.select.start(x0);
        deps.cursorTo(m.clientX);
      }
    };
    const onUp = (u: PointerEvent) => {
      if (!own(u)) return;
      const d = drag();
      const s = swipe();
      const tap =
        u.pointerType === 'touch' &&
        part !== 'instrument' &&
        stage === 'pressed' &&
        !d &&
        !s &&
        !peeking();
      if (selecting) {
        selecting = false;
        deps.select.end();
      }
      end?.();
      if (tap) deps.onTap({ x: u.clientX, y: u.clientY, at: u.timeStamp });
      if (stage === 'picker') return;
      if (d) deps.onDrop(d.lane, dropOf(d.from, d.slot, d.overBin));
      else if (s && swipeRemoves(s.dx, s.width)) deps.onDrop(s.lane, 'remove');
    };
    const onKey = (k: KeyboardEvent) => {
      k.preventDefault();
      k.stopPropagation();
      if (dragKeyOf(k.key) === 'cancel') end?.();
    };
    const cancel = (c: PointerEvent) => {
      if (own(c)) end?.();
    };
    const touch = e.pointerType === 'touch';
    setHolding(touch);
    const lift = touch
      ? setTimeout(() => {
          if (touchHoldOf('pressed', part, last.x - x0, last.y - y0, HOLD_MS) !== 'lift') return;
          stage = 'lifted';
          pickUp(last.x, last.y, true);
        }, HOLD_MS)
      : undefined;
    const picker = touch ? setTimeout(openPicker, PICKER_HOLD_MS) : undefined;
    const ac = new AbortController();
    const { signal } = ac;
    window.addEventListener('keydown', onKey, { capture: true, signal });
    el.addEventListener('pointermove', onMove, { signal });
    el.addEventListener('pointerup', onUp, { signal });
    el.addEventListener('pointercancel', cancel, { signal });
    el.addEventListener('lostpointercapture', cancel, { signal });
    end = () => {
      end = null;
      if (selecting) deps.select.cancel();
      if (peeking()) deps.peek.end();
      setPeeking(false);
      setPicking(false);
      grabbed = null;
      grabbedPart = null;
      clearTimeout(lift);
      clearTimeout(picker);
      cancelAnimationFrame(frame);
      ac.abort();
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      setDrag(null);
      setSwipe(null);
      setHolding(false);
    };
  };

  const pinchable = () => pinchesFrom(flags(), grabbedPart);
  return { drag, swipe, peeking, pinchable, abandon: () => end?.(), grab };
}
