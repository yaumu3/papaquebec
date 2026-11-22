import { createSignal } from 'solid-js';

interface Timers<Id> {
  set(fn: () => void, ms: number): Id;
  clear(id: Id): void;
}

/** A light that stays on for a time each time it is lit; lighting it again starts the time over. */
export function createHoldWith<Id>(timers: Timers<Id>) {
  const [lit, setLit] = createSignal(false);
  let pending: Id | undefined;
  const cancel = () => {
    if (pending !== undefined) timers.clear(pending);
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
      pending = timers.set(() => setLit(false), ms);
    },
  };
}

export const createHold = () =>
  createHoldWith<ReturnType<typeof setTimeout>>({
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (id) => clearTimeout(id),
  });
