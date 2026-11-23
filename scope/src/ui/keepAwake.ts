/** A device held in the hand: its main pointer is a finger. */
const HANDHELD_QUERY = '(pointer: coarse)';

interface Lock {
  release(): Promise<void>;
}

interface Locks {
  request(type: 'screen'): Promise<Lock>;
}

interface LockHost {
  matchMedia(query: string): { matches: boolean };
  navigator: { wakeLock?: Locks };
}

interface Page {
  visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

/** The wake locks of a handheld device; none on a desktop, whose display is left to sleep. */
export function screenLocks(win: LockHost): Locks | undefined {
  return win.matchMedia(HANDHELD_QUERY).matches ? win.navigator.wakeLock : undefined;
}

/**
 * Keeps the screen on while the page shows. The system takes the lock from a hidden page, so
 * each return asks anew; a refusal, as on low battery, is left at that. Returns a disposer.
 */
export function keepAwake(page: Page, locks: Locks | undefined): () => Promise<void> {
  if (!locks) return () => Promise.resolve();
  let held: Promise<Lock | null> = Promise.resolve(null);
  const ask = () => {
    if (page.visibilityState === 'visible') held = locks.request('screen').catch(() => null);
  };
  ask();
  page.addEventListener('visibilitychange', ask);
  return async () => {
    page.removeEventListener('visibilitychange', ask);
    await (await held)?.release();
  };
}
