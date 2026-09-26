import type { View } from '../../render/protocol';
import { createActions } from './actions';
import { attachKeyboard } from './devices/keyboard';
import { attachMouse } from './devices/mouse';
import { attachTouch } from './devices/touch';
import { listen, offAll } from './dom';

/**
 * Wires input to the canvas: every device asks for what it can through the one set of scope
 * actions in `actions.ts`, each in its own way (`devices/`). Returns a disposer.
 */
export function attachInput(canvas: HTMLCanvasElement, view: () => View): () => void {
  const actions = createActions({
    view,
    setCursor: (c) => {
      canvas.style.cursor = c;
    },
  });
  return offAll([
    attachMouse(canvas, actions),
    attachTouch(canvas, actions),
    attachKeyboard(actions),
    // A press anywhere outside an open menu closes it.
    listen(window, 'pointerdown', (e) => {
      if (!(e.target instanceof Element) || !e.target.closest('[data-menu]')) actions.dismissMenu();
    }),
  ]);
}
