import { isPhone } from '../state/layout';
import { contentMovesSheet } from './sheetMotion';

/**
 * How far a finger on a sheet's content travels before it is told a pull from a scroll, CSS px:
 * past the wobble of a tap, short of where the page starts to scroll on its own.
 */
export const DECIDE_PX = 6;

/** The sheet's drag, which a finger on its content works once it takes the sheet. */
interface Pull {
  down(sheet: Element, y: number, t: number): void;
  move(y: number, t: number): void;
  up(y: number, t: number): void;
}

/** The parts of a `Touch` the tracker reads. */
export interface Finger {
  identifier: number;
  clientX: number;
  clientY: number;
}

/** The parts of a `TouchEvent` the tracker reads. */
export interface Fingers {
  touches: ArrayLike<Finger>;
  changedTouches: ArrayLike<Finger>;
  target: EventTarget | null;
  timeStamp: number;
}

/** What the tracker asks of the page about where a finger is. */
export interface ContentReads {
  /** Whether a finger on `target` is free to pull the sheet, not held by a control of its own. */
  free(target: EventTarget | null): boolean;
  /** Whether the content under `target` is scrolled to its top, or has nothing to scroll. */
  atTop(target: EventTarget | null): boolean;
  atLargest(): boolean;
  /** Whether the page holds a text selection, which a finger works rather than the sheet. */
  selecting(): boolean;
}

/** Whether what the finger landed on takes drags itself, as a slider does, keeping them from the sheet. */
function ownsDrag(target: Element, sheet: Element): boolean {
  for (let el: Element | null = target; el && el !== sheet; el = el.parentElement) {
    if (getComputedStyle(el).touchAction === 'none' || el.matches('input, select, textarea'))
      return true;
  }
  return false;
}

/** Whether the content under the finger is scrolled to its top, or has nothing to scroll. */
function scrolledToTop(target: Element, sheet: Element): boolean {
  for (let el: Element | null = target; el && el !== sheet; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    const scrolls = overflowY === 'auto' || overflowY === 'scroll';
    if (scrolls && el.scrollHeight > el.clientHeight) return el.scrollTop <= 0;
  }
  return true;
}

/** The finger `id` among `list`, if it is there. */
const fingerOf = (list: ArrayLike<Finger>, id: number) =>
  Array.from(list).find((f) => f.identifier === id);

/**
 * Tells which fingers on a sheet's content pull the sheet: a lone finger that, once past a tap's
 * wobble, goes where the content would not scroll while no text is selected, followed by its
 * identifier until it lifts, whatever other fingers do meanwhile. `move` returns true when the
 * move is the sheet's, so that the content must not scroll.
 */
export function trackContentTouches(
  pull: {
    down(y: number, t: number): void;
    move(y: number, t: number): void;
    up(y: number, t: number): void;
  },
  read: ContentReads,
) {
  let landed: { id: number; x: number; y: number; t: number } | null = null;
  /** The finger pulling the sheet. */
  let pulling: number | null = null;
  return {
    start(e: Fingers): void {
      if (pulling !== null) return;
      const touch = e.touches[0];
      landed =
        touch && e.touches.length === 1 && read.free(e.target)
          ? { id: touch.identifier, x: touch.clientX, y: touch.clientY, t: e.timeStamp }
          : null;
    },
    move(e: Fingers): boolean {
      const first = landed && fingerOf(e.changedTouches, landed.id);
      if (landed && first) {
        const up = landed.y - first.clientY;
        const across = first.clientX - landed.x;
        if (Math.hypot(up, across) < DECIDE_PX) return false;
        const moves =
          !read.selecting() &&
          contentMovesSheet({
            up,
            across,
            atLargest: read.atLargest(),
            atTop: read.atTop(e.target),
          });
        if (moves) {
          pulling = landed.id;
          pull.down(landed.y, landed.t);
        }
        landed = null;
      }
      if (pulling === null) return false;
      const touch = fingerOf(e.changedTouches, pulling);
      if (touch) pull.move(touch.clientY, e.timeStamp);
      return true;
    },
    end(e: Fingers): void {
      if (landed && fingerOf(e.changedTouches, landed.id)) landed = null;
      const touch = pulling === null ? undefined : fingerOf(e.changedTouches, pulling);
      if (!touch) return;
      pull.up(touch.clientY, e.timeStamp);
      pulling = null;
    },
  };
}

/**
 * Lets a finger on a phone sheet's content drag the sheet where the content would not scroll that
 * way, deciding on its first move, before the content can start to scroll. Returns a disposer.
 */
export function dragFromContent(
  sheet: HTMLElement,
  drag: Pull,
  atLargest: () => boolean,
): () => void {
  const fingers = trackContentTouches(
    {
      down: (y, t) => drag.down(sheet, y, t),
      move: (y, t) => drag.move(y, t),
      up: (y, t) => drag.up(y, t),
    },
    {
      free: (target) => isPhone() && target instanceof Element && !ownsDrag(target, sheet),
      atTop: (target) => target instanceof Element && scrolledToTop(target, sheet),
      atLargest,
      selecting: () => !(document.getSelection()?.isCollapsed ?? true),
    },
  );
  const start = (e: TouchEvent) => fingers.start(e);
  const move = (e: TouchEvent) => {
    if (fingers.move(e)) e.preventDefault();
  };
  const end = (e: TouchEvent) => fingers.end(e);
  sheet.addEventListener('touchstart', start, { passive: true });
  sheet.addEventListener('touchmove', move, { passive: false });
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);
  return () => {
    sheet.removeEventListener('touchstart', start);
    sheet.removeEventListener('touchmove', move);
    sheet.removeEventListener('touchend', end);
    sheet.removeEventListener('touchcancel', end);
  };
}
