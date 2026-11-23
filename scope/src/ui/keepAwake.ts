/** A device held in the hand: its main pointer is a finger. */
const HANDHELD_QUERY = '(pointer: coarse)';

/**
 * What can mark the page as touched. WebKit refuses a lock until one has, and from then on
 * grants it for the life of the page (WebCore's WakeLock::request).
 */
const ASKING_EVENTS = ['visibilitychange', 'pointerup', 'touchend', 'click', 'keydown'];

interface Lock {
  addEventListener(type: 'release', listener: () => void): void;
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
  addEventListener(type: string, listener: () => void, capture: boolean): void;
  removeEventListener(type: string, listener: () => void, capture: boolean): void;
}

/** The wake locks of a handheld device; none on a desktop, whose display is left to sleep. */
export function screenLocks(win: LockHost): Locks | undefined {
  return win.matchMedia(HANDHELD_QUERY).matches ? win.navigator.wakeLock : undefined;
}

/**
 * Keeps the screen on while the page shows. The system takes the lock from a hidden page, and
 * may from a showing one, so each return and each loss asks anew; a refusal waits for the next
 * return or touch. Returns a disposer.
 */
export function keepAwake(page: Page, locks: Locks | undefined): () => Promise<void> {
  if (!locks) return () => Promise.resolve();
  let disposed = false;
  /** The one lock asked for or held; null once it is refused or gone. */
  let held: Promise<Lock | null> | null = null;
  const ask = () => {
    if (disposed || held || page.visibilityState !== 'visible') return;
    held = locks.request('screen').then(
      (lock) => {
        lock.addEventListener('release', () => {
          held = null;
          ask();
        });
        return lock;
      },
      () => {
        held = null;
        return null;
      },
    );
  };
  ask();
  for (const type of ASKING_EVENTS) page.addEventListener(type, ask, true);
  return async () => {
    disposed = true;
    for (const type of ASKING_EVENTS) page.removeEventListener(type, ask, true);
    await (await held)?.release();
  };
}
