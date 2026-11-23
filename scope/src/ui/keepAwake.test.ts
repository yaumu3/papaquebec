import { describe, expect, it } from 'bun:test';

import { keepAwake, screenLocks } from './keepAwake';

/** A document whose visibility can be turned, and whose events can be fired, by hand. */
function fakePage(visibilityState: DocumentVisibilityState) {
  const listeners = new Map<string, Set<() => void>>();
  const fire = (type: string) => listeners.get(type)?.forEach((fn) => fn());
  const page = {
    visibilityState,
    addEventListener: (type: string, fn: () => void) => {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(fn));
    },
    removeEventListener: (type: string, fn: () => void) => {
      listeners.get(type)?.delete(fn);
    },
  };
  return {
    page,
    listening: () => [...listeners.values()].reduce((n, fns) => n + fns.size, 0),
    fire,
    turn: (state: DocumentVisibilityState) => {
      page.visibilityState = state;
      fire('visibilitychange');
    },
  };
}

/** Wake locks that record every request and which were given back; `take` is the system taking one. */
function fakeLocks(refuse = false) {
  const requested: string[] = [];
  const released: number[] = [];
  const takers: (() => void)[] = [];
  return {
    locks: {
      request: (type: 'screen') => {
        const nth = requested.push(type) - 1;
        if (refuse) return Promise.reject(new DOMException('low battery', 'NotAllowedError'));
        const listeners = new Set<() => void>();
        takers[nth] = () => listeners.forEach((fn) => fn());
        return Promise.resolve({
          addEventListener: (_type: 'release', fn: () => void) => {
            listeners.add(fn);
          },
          release: () => {
            released.push(nth);
            takers[nth]?.();
            return Promise.resolve();
          },
        });
      },
    },
    requested,
    released,
    take: (nth: number) => takers[nth]?.(),
  };
}

/** Resolves once every request made so far has been answered. */
const answered = (): Promise<void> => new Promise((done) => setTimeout(done));

/** A window with wake locks, whose main pointer is a finger or not. */
const fakeHost = (coarse: boolean) => ({
  matchMedia: (query: string) => ({ matches: coarse && query === '(pointer: coarse)' }),
  navigator: { wakeLock: fakeLocks().locks },
});

describe('keepAwake', () => {
  it('asks for a screen lock on a page that is showing', () => {
    // Arrange
    const { page } = fakePage('visible');
    const { locks, requested } = fakeLocks();

    // Act
    keepAwake(page, locks);

    // Assert
    expect(requested).toEqual(['screen']);
  });

  it('asks for nothing while the page is hidden', () => {
    // Arrange
    const { page } = fakePage('hidden');
    const { locks, requested } = fakeLocks();

    // Act
    keepAwake(page, locks);

    // Assert
    expect(requested).toEqual([]);
  });

  it('asks again when the page comes back, the system having taken the lock', async () => {
    // Arrange
    const { page, turn } = fakePage('visible');
    const { locks, requested, take } = fakeLocks();
    keepAwake(page, locks);
    await answered();
    turn('hidden');
    take(0);

    // Act
    turn('visible');

    // Assert
    expect(requested).toEqual(['screen', 'screen']);
  });

  it('asks again after a refusal', async () => {
    // Arrange
    const { page, turn } = fakePage('visible');
    const { locks, requested } = fakeLocks(true);
    keepAwake(page, locks);
    await answered();
    turn('hidden');

    // Act
    turn('visible');

    // Assert
    expect(requested).toEqual(['screen', 'screen']);
  });

  it('asks again at each kind of touch after a refusal, which is all WebKit gives an untouched page', async () => {
    // Arrange
    const gestures = ['pointerup', 'touchend', 'click', 'keydown'];
    const cases = gestures.map((gesture) =>
      Object.assign({ gesture }, fakePage('visible'), fakeLocks(true)),
    );
    for (const { page, locks } of cases) keepAwake(page, locks);
    await answered();

    // Act
    for (const { gesture, fire } of cases) fire(gesture);

    // Assert
    expect(cases.map(({ requested }) => requested.length)).toEqual([2, 2, 2, 2]);
  });

  it('asks for nothing at a touch while it holds the lock', async () => {
    // Arrange
    const { page, fire } = fakePage('visible');
    const { locks, requested } = fakeLocks();
    keepAwake(page, locks);
    await answered();

    // Act
    fire('pointerup');

    // Assert
    expect(requested).toEqual(['screen']);
  });

  it('stops listening once disposed', async () => {
    // Arrange
    const { page, listening } = fakePage('visible');
    const { locks } = fakeLocks();
    const dispose = keepAwake(page, locks);

    // Act
    await dispose();

    // Assert
    expect(listening()).toBe(0);
  });

  it('asks again when the system takes the lock from a page still showing', async () => {
    // Arrange
    const { page } = fakePage('visible');
    const { locks, requested, take } = fakeLocks();
    keepAwake(page, locks);
    await answered();

    // Act
    take(0);

    // Assert
    expect(requested).toEqual(['screen', 'screen']);
  });

  it('asks once for a page told twice that it shows', () => {
    // Arrange
    const { page, turn } = fakePage('visible');
    const { locks, requested } = fakeLocks();
    keepAwake(page, locks);

    // Act
    turn('visible');

    // Assert
    expect(requested).toEqual(['screen']);
  });

  it('asks for no other lock as its own goes at disposal', async () => {
    // Arrange
    const { page } = fakePage('visible');
    const { locks, requested } = fakeLocks();
    const dispose = keepAwake(page, locks);

    // Act
    await dispose();

    // Assert
    expect(requested).toEqual(['screen']);
  });

  it('gives the lock back once disposed', async () => {
    // Arrange
    const { page } = fakePage('visible');
    const { locks, released } = fakeLocks();
    const dispose = keepAwake(page, locks);

    // Act
    await dispose();

    // Assert
    expect(released).toEqual([0]);
  });

  it('stops asking once disposed', async () => {
    // Arrange
    const { page, turn } = fakePage('hidden');
    const { locks, requested } = fakeLocks();
    const dispose = keepAwake(page, locks);
    await dispose();

    // Act
    turn('visible');

    // Assert
    expect(requested).toEqual([]);
  });

  it('does not listen where there are no wake locks', () => {
    // Arrange
    const { page, listening } = fakePage('visible');

    // Act
    keepAwake(page, undefined);

    // Assert
    expect(listening()).toBe(0);
  });
});

describe('screenLocks', () => {
  it('hands out the wake locks of a device held in the hand', () => {
    // Arrange
    const win = fakeHost(true);

    // Act
    const locks = screenLocks(win);

    // Assert
    expect(locks).toBe(win.navigator.wakeLock);
  });

  it('hands out none on a desktop', () => {
    // Arrange
    const win = fakeHost(false);

    // Act
    const locks = screenLocks(win);

    // Assert
    expect(locks).toBeUndefined();
  });
});
