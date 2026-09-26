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

/** The keyboard's shortcuts; keys typed into an input are left alone. */
export function keyHandler(a: ScopeActions): (e: KeyEvent) => void {
  const b = bindings(a);
  return (e) => {
    const t = e.target;
    if (t && 'tagName' in t && t.tagName === 'INPUT') return;
    b[e.key.length === 1 ? e.key.toLowerCase() : e.key]?.(e);
  };
}

/** Attaches the keyboard's shortcuts. Returns a disposer. */
export function attachKeyboard(a: ScopeActions): () => void {
  return listen(window, 'keydown', keyHandler(a));
}
