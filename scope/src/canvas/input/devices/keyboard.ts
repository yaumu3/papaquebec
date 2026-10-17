import type { ScopeActions } from '../actions';
import { listen } from '../dom';

/** The parts of a `KeyboardEvent` the shortcuts read. */
export type KeyEvent = Pick<KeyboardEvent, 'key' | 'shiftKey' | 'target'>;

/** Which key asks for which action; letters match in either case. */
function bindings(a: ScopeActions): Record<string, (e: KeyEvent) => void> {
  const del = (e: KeyEvent) => (e.shiftKey ? a.clearRbls() : a.deleteLastRbl());
  return {
    Escape: () => a.cancel(),
    '?': () => a.toggleHint(),
    '[': () => a.stepRange(-1),
    ']': () => a.stepRange(1),
    t: () => a.cycleTrails(),
    v: () => a.cycleVectors(),
    l: () => a.toggleList(),
    r: () => a.startRbl(),
    Home: () => a.recenter(),
    Delete: del,
    Backspace: del,
  };
}

/** The history's root, which handles its own keys. */
export const HISTORY_SELECTOR = '[data-history]';

/** The ND, whose zoom buttons handle their own keys. */
export const ND_SELECTOR = '[data-nd]';

/** A tab list, which handles its own keys. */
export const TABLIST_SELECTOR = '[role="tablist"]';

/** Whether a key pressed at `t` is another's to handle: typed into an input, or pressed in the history, on a tab list or on the ND. */
export function ownsKeys(t: EventTarget | null): boolean {
  if (!t) return false;
  if ('tagName' in t && t.tagName === 'INPUT') return true;
  if (!('closest' in t) || typeof t.closest !== 'function') return false;
  const closest = t.closest.bind(t);
  return [HISTORY_SELECTOR, TABLIST_SELECTOR, ND_SELECTOR].some((sel) => closest(sel) !== null);
}

/** The keyboard's shortcuts; keys typed into an input or pressed in the history, on a tab list or on the ND are left alone. */
export function keyHandler(a: ScopeActions): (e: KeyEvent) => void {
  const b = bindings(a);
  return (e) => {
    if (ownsKeys(e.target)) return;
    b[e.key.length === 1 ? e.key.toLowerCase() : e.key]?.(e);
  };
}

/** Attaches the keyboard's shortcuts. Returns a disposer. */
export function attachKeyboard(a: ScopeActions): () => void {
  return listen(window, 'keydown', keyHandler(a));
}
