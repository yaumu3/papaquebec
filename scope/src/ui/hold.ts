import { createSignal } from 'solid-js';

import { type Timer, WINDOW_TIMER } from '../canvas/settle';

/** A light that stays on for a time each time it is lit; lighting it again starts the time over. */
export function createHold(timer: Timer = WINDOW_TIMER) {
  const [lit, setLit] = createSignal(false);
  let pending: number | undefined;
  const cancel = () => {
    if (pending !== undefined) timer.clear(pending);
    pending = undefined;
  };
  const drop = () => {
    cancel();
    setLit(false);
  };
  return {
    lit,
    drop,
    hold(ms: number) {
      cancel();
      setLit(true);
      pending = timer.set(() => setLit(false), ms);
    },
  };
}
