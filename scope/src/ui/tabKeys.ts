import { wrapIndex } from './wrap';

/** The tab a key moves to from `current`: the next or previous round the ring, the first or the last; null for any other key. */
export function tabFor<T>(key: string, tabs: readonly T[], current: T): T | null {
  const i = tabs.indexOf(current);
  if (key === 'ArrowRight') return tabs[wrapIndex(i, tabs.length, false)] ?? null;
  if (key === 'ArrowLeft') return tabs[wrapIndex(i, tabs.length, true)] ?? null;
  if (key === 'Home') return tabs[0] ?? null;
  if (key === 'End') return tabs.at(-1) ?? null;
  return null;
}
