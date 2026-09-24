type Binding = readonly [key: string, action: string];
type Column = readonly Binding[];
/** Columns laid side by side; blocks stack with a blank line between. */
type Block = readonly Column[];

const KEYBOARD: Block = [
  [
    ['[ ]', 'RANGE'],
    ['T', 'TRAIL CYCLE'],
    ['V', 'VECTOR CYCLE'],
    ['L', 'LIST'],
    ['?', 'HINT'],
  ],
  [
    ['R', 'RBL'],
    ['DEL', 'LAST RBL'],
    ['SHIFT-DEL', 'ALL RBL'],
    ['HOME', 'RESET PAN'],
    ['ESC', 'CANCEL'],
  ],
];

const MOUSE: Block = [
  [
    ['DRAG', 'PAN'],
    ['DRAG TARGET', 'RBL'],
  ],
  [
    ['RIGHT-DRAG', 'RANGE CURSOR'],
    ['WHEEL', 'ZOOM'],
  ],
];

const KEY_GAP = 2;
const COLUMN_GAP = 4;

const widest = (blocks: readonly Block[], column: number, part: 0 | 1) =>
  Math.max(0, ...blocks.flatMap((b) => (b[column] ?? []).map((binding) => binding[part].length)));

/** Keys and actions align down each column across every block. */
function layout(blocks: readonly Block[]): string {
  const columns = Math.max(...blocks.map((b) => b.length));
  const width = Array.from({ length: columns }, (_, i) => ({
    key: widest(blocks, i, 0) + KEY_GAP,
    action: widest(blocks, i, 1),
  }));
  const cell = (b: Binding | undefined, i: number) => {
    const w = width[i] ?? { key: 0, action: 0 };
    return (b ? b[0].padEnd(w.key) + b[1] : '').padEnd(w.key + w.action);
  };
  const block = (b: Block) =>
    Array.from({ length: Math.max(...b.map((c) => c.length)) }, (_, row) =>
      b
        .map((c, i) => cell(c[row], i))
        .join(' '.repeat(COLUMN_GAP))
        .trimEnd(),
    ).join('\n');
  return blocks.map(block).join('\n\n');
}

export const HINT = layout([KEYBOARD, MOUSE]);
