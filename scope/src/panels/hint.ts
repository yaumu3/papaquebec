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

export const HINT: readonly HintBlock[] = [
  {
    title: 'KEYBOARD',
    columns: [
      [
        { keys: ['[', ']'], action: 'RANGE', sep: '' },
        key('T', 'TRAIL CYCLE'),
        key('V', 'VECTOR CYCLE'),
        key('L', 'LIST'),
        key('?', 'HINT'),
      ],
      [
        key('R', 'RBL'),
        key('DEL', 'LAST RBL'),
        { keys: ['SHIFT', 'DEL'], action: 'ALL RBL' },
        key('HOME', 'RESET PAN'),
        key('ESC', 'CANCEL'),
      ],
    ],
  },
  {
    title: 'MOUSE',
    columns: [
      [key('DRAG', 'PAN'), key('DRAG TARGET', 'RBL')],
      [key('RIGHT-DRAG', 'RANGE CURSOR'), key('WHEEL', 'ZOOM')],
    ],
  },
];
