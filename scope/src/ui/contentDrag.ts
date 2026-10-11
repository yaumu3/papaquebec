import { isPhone } from '../state/layout';
import { contentMovesSheet } from './sheetMotion';

/** The sheet's drag, which a finger on its content works once it takes the sheet. */
interface Pull {
  down(sheet: Element, y: number, t: number): void;
  move(y: number, t: number): void;
  up(y: number, t: number): void;
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

/**
 * Lets a finger on a phone sheet's content drag the sheet where the content would not scroll that
 * way, deciding on its first move, before the content can start to scroll. Returns a disposer.
 */
export function dragFromContent(
  sheet: HTMLElement,
  drag: Pull,
  atLargest: () => boolean,
): () => void {
  let landed: { x: number; y: number; t: number } | null = null;
  let moving = false;
  const start = (e: TouchEvent) => {
    const touch = e.touches[0];
    const free = isPhone() && e.target instanceof Element && !ownsDrag(e.target, sheet);
    landed =
      touch && e.touches.length === 1 && free
        ? { x: touch.clientX, y: touch.clientY, t: e.timeStamp }
        : null;
    moving = false;
  };
  const move = (e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    if (landed && e.target instanceof Element) {
      moving = contentMovesSheet({
        up: landed.y - touch.clientY,
        across: touch.clientX - landed.x,
        atLargest: atLargest(),
        atTop: scrolledToTop(e.target, sheet),
      });
      if (moving) drag.down(sheet, landed.y, landed.t);
      landed = null;
    }
    if (!moving) return;
    e.preventDefault();
    drag.move(touch.clientY, e.timeStamp);
  };
  const end = (e: TouchEvent) => {
    const touch = e.changedTouches[0];
    if (moving && touch) drag.up(touch.clientY, e.timeStamp);
    landed = null;
    moving = false;
  };
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
