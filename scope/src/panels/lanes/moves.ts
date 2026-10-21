import type { WindowKey } from '../../state/window';
import { reorderKey } from '../../ui/reorder';

/** What can be done to a lane where it stands: moved a place up unless first, down unless last, or removed. */
export interface LaneMoves {
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}

/** Does to a lane what a key or a palette's LANE row asks, unless it stands at the end it would leave by. */
export function perform(m: LaneMoves, ask: 'up' | 'down' | 'remove'): void {
  if (ask === 'up' && !m.first) m.onUp();
  else if (ask === 'down' && !m.last) m.onDown();
  else if (ask === 'remove') m.onRemove();
}

/** Does to a lane what a key pressed for it asks, keeping that key from the page; any other key is left alone. */
export function onMoveKey(
  m: LaneMoves,
  e: Pick<KeyboardEvent, 'key' | 'altKey' | 'preventDefault' | 'stopPropagation'>,
): void {
  const ask = reorderKey(e);
  if (ask === null) return;
  e.preventDefault();
  e.stopPropagation();
  perform(m, ask);
}

/** The window key `e` is, if it is pressed without a modifier. */
export function windowKeyOf(
  e: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>,
): WindowKey | null {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  switch (e.key) {
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ArrowUp':
    case 'ArrowDown':
    case 'Home':
      return e.key;
    default:
      return null;
  }
}
