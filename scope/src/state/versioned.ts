import { createSignal, untrack } from 'solid-js';

/**
 * A derived value recomputed only after `invalidate`, yet tracked by Solid through a version
 * signal. For a derivation too heavy to redo on every read, such as merging charts on a pointer move.
 * The computation runs untracked, so what it reads reaches a reader only through `invalidate`,
 * never ahead of it while the cache is still the old one.
 */
export function versioned<T>(compute: () => T): { get: () => T; invalidate: () => void } {
  const [version, setVersion] = createSignal(0);
  let cached: { version: number; value: T } | null = null;
  return {
    get() {
      const v = version();
      if (cached?.version !== v) cached = { version: v, value: untrack(compute) };
      return cached.value;
    },
    invalidate() {
      setVersion((v) => v + 1);
    },
  };
}
