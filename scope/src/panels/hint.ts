import { SHORTCUTS } from '../canvas/input/devices/keyboard';

/** Caps pressed together, joined by `sep` (a chord by default), and what they do. */
export interface Binding {
  keys: readonly string[];
  action: string;
  sep?: string;
}
export type Column = readonly Binding[];

/** One titled group of bindings, its columns laid side by side. */
export interface HintBlock {
  title: string;
  columns: readonly Column[];
}

const key = (k: string, action: string): Binding => ({ keys: [k], action });

/** The shortcuts in two columns, the first no shorter than the second. */
const half = Math.ceil(SHORTCUTS.length / 2);

export const HINT: readonly HintBlock[] = [
  { title: 'KEYBOARD', columns: [SHORTCUTS.slice(0, half), SHORTCUTS.slice(half)] },
  {
    title: 'LANES',
    columns: [
      [
        { keys: ['ALT', '↑'], action: 'LANE UP' },
        { keys: ['ALT', '↓'], action: 'LANE DOWN' },
      ],
      [key('DEL', 'REMOVE LANE')],
    ],
  },
  {
    title: 'MOUSE',
    columns: [
      [key('DRAG', 'PAN'), key('DRAG SELECTED', 'RBL')],
      [key('RIGHT-DRAG', 'RANGE CURSOR'), key('WHEEL', 'ZOOM')],
    ],
  },
];
