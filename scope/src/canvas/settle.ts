export interface Timer {
  set: (fn: () => void, ms: number) => number;
  clear: (id: number) => void;
}

const WINDOW_TIMER: Timer = {
  set: (fn, ms) => window.setTimeout(fn, ms),
  clear: (id) => window.clearTimeout(id),
};

/** Passes on only the latest value, once no newer one has arrived for `ms`. */
export function debounce<T>(
  ms: number,
  apply: (value: T) => void,
  timer: Timer = WINDOW_TIMER,
): (value: T) => void {
  let pending: number | null = null;
  return (value) => {
    if (pending !== null) timer.clear(pending);
    pending = timer.set(() => {
      pending = null;
      apply(value);
    }, ms);
  };
}
