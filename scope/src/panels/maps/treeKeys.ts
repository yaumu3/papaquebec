/** The tree's arrow keys: which way a key moves from a row, and the moving. */

import { batch } from 'solid-js';

export type TreeMove = 'next' | 'previous' | 'toggle' | 'parent';

/** What a key does at a row; `expanded` is whether it is open, null for one that opens nothing. */
export function treeMove(key: string, expanded: boolean | null): TreeMove | null {
  switch (key) {
    case 'ArrowDown':
      return 'next';
    case 'ArrowUp':
      return 'previous';
    case 'ArrowRight':
      if (expanded === null) return null;
      return expanded ? 'next' : 'toggle';
    case 'ArrowLeft':
      return expanded ? 'toggle' : 'parent';
    default:
      return null;
  }
}

const HEAD = '[data-head]';
const TREEITEM = '[role="treeitem"]';

/** The head of the row that holds this one, if there is one. */
const parentHead = (head: Element): HTMLElement | null | undefined =>
  head
    .closest<HTMLElement>(TREEITEM)
    ?.parentElement?.closest<HTMLElement>(TREEITEM)
    ?.querySelector<HTMLElement>(HEAD);

function expandedOf(head: HTMLElement): boolean | null {
  const flag = head.getAttribute('aria-expanded');
  return flag === null ? null : flag === 'true';
}

/**
 * A key pressed in the tree: on a head, an arrow moves focus along the heads, opens or closes
 * the row, or goes up to its parent. A dot does nothing. Opening and closing is the head's own
 * click, so a search's closing stays as temporary as a tap.
 */
export function onTreeKey(e: KeyboardEvent, tree: HTMLElement, box: HTMLElement | undefined): void {
  const head = e.target instanceof Element ? e.target.closest<HTMLElement>(HEAD) : null;
  if (!head) return;
  const move = treeMove(e.key, expandedOf(head));
  if (!move) return;
  e.preventDefault();
  const heads = [...tree.querySelectorAll<HTMLElement>(HEAD)];
  const at = heads.indexOf(head);
  if (move === 'toggle') {
    head.click();
    return;
  }
  const target =
    move === 'parent' ? parentHead(head) : move === 'next' ? heads[at + 1] : (heads[at - 1] ?? box);
  // The blur and the focus fire together: one write, one post.
  batch(() => target?.focus());
}
