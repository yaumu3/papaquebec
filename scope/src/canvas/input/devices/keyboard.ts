import { PANEL_IDS, PANEL_NAMES, type PanelId } from '../../../state/settingsDefaults';
import type { ScopeActions } from '../actions';
import { listen } from '../dom';

/** The parts of a `KeyboardEvent` the shortcuts read. */
export type KeyEvent = Pick<
  KeyboardEvent,
  | 'key'
  | 'shiftKey'
  | 'altKey'
  | 'ctrlKey'
  | 'metaKey'
  | 'defaultPrevented'
  | 'preventDefault'
  | 'target'
>;

/** One shortcut: the keys that ask for it, how the hint shows it, and what it does. */
export interface Shortcut {
  /** The `KeyboardEvent.key` values that ask for it; letters in lower case match either case. */
  on: readonly string[];
  /** Asked only with Shift held, or only without it; with either when absent. */
  shift?: boolean;
  /** The caps the hint shows. */
  keys: readonly string[];
  /** What joins the caps in the hint; a chord's `+` when absent. */
  sep?: string;
  action: string;
  /** `key` is the one of `on` that was pressed. */
  run: (a: ScopeActions, key: string) => void;
}

const letter = (k: string, action: string, run: Shortcut['run']): Shortcut => ({
  on: [k],
  keys: [k.toUpperCase()],
  action,
  run,
});

/** The digit that toggles a panel: its place in the bars, from 1. */
const panelKey = (id: PanelId): string => String(PANEL_IDS.indexOf(id) + 1);

/** What a panel's button says of itself: its name and its key. */
export const panelTip = (id: PanelId): string => `${PANEL_NAMES[id]} · ${panelKey(id)}`;

const DELETE = ['Delete', 'Backspace'];

/** Every shortcut, in the hint's order. */
export const SHORTCUTS: readonly Shortcut[] = [
  {
    on: ['+', '-'],
    keys: ['+', '-'],
    sep: '',
    action: 'ZOOM',
    run: (a, k) => a.stepRange(k === '+' ? -1 : 1),
  },
  letter('t', 'TRAIL CYCLE', (a) => a.cycleTrails()),
  letter('v', 'VECTOR CYCLE', (a) => a.cycleVectors()),
  letter('r', 'RBL', (a) => a.startRbl()),
  { on: DELETE, shift: false, keys: ['DEL'], action: 'LAST RBL', run: (a) => a.deleteLastRbl() },
  {
    on: DELETE,
    shift: true,
    keys: ['SHIFT', 'DEL'],
    action: 'ALL RBL',
    run: (a) => a.clearRbls(),
  },
  { on: ['Home'], keys: ['HOME'], action: 'RESET PAN', run: (a) => a.recenter() },
  {
    on: ['ArrowUp', 'ArrowDown'],
    keys: ['↑', '↓'],
    sep: '',
    action: 'SELECT',
    run: (a, k) => a.stepSelection(k === 'ArrowUp' ? -1 : 1),
  },
  ...PANEL_IDS.map((id) => letter(panelKey(id), PANEL_NAMES[id], (a) => a.togglePanel(id))),
  letter('/', 'MAP SEARCH', (a) => a.searchMaps()),
  letter('i', 'ABOUT', (a) => a.toggleAbout()),
  letter('?', 'HINT', (a) => a.toggleHint()),
  { on: ['Escape'], keys: ['ESC'], action: 'CANCEL', run: (a) => a.cancel() },
];

/** The lanes' root, which handles its own keys. */
export const LANES_SELECTOR = '[data-lanes]';

/** The ND, whose zoom buttons handle their own keys. */
export const ND_SELECTOR = '[data-nd]';

/** Whether a key pressed at `t` is another's to handle: typed into an input, or pressed in the lanes or on the ND. */
export function ownsKeys(t: EventTarget | null): boolean {
  if (!t) return false;
  if ('tagName' in t && t.tagName === 'INPUT') return true;
  if (!('closest' in t) || typeof t.closest !== 'function') return false;
  const closest = t.closest.bind(t);
  return [LANES_SELECTOR, ND_SELECTOR].some((sel) => closest(sel) !== null);
}

/**
 * The keyboard's shortcuts, each kept from the browser; a chord with Ctrl, Cmd or Alt is the
 * browser's, and a key another handler has taken, typed into an input or pressed in the lanes or
 * on the ND is left alone.
 */
export function keyHandler(a: ScopeActions): (e: KeyEvent) => void {
  return (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || ownsKeys(e.target)) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const asked = SHORTCUTS.find((s) => s.on.includes(k) && (s.shift ?? e.shiftKey) === e.shiftKey);
    if (!asked) return;
    e.preventDefault();
    asked.run(a, k);
  };
}

/** Attaches the keyboard's shortcuts. Returns a disposer. */
export function attachKeyboard(a: ScopeActions): () => void {
  return listen(window, 'keydown', keyHandler(a));
}
