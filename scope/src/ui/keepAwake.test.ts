import { describe, expect, it } from 'bun:test';

import { keepAwake, screenLocks } from './keepAwake';

/** A document whose visibility can be turned by hand. */
function fakePage(visibilityState: DocumentVisibilityState) {
  const listeners = new Set<() => void>();
  const page = {
    visibilityState,
    addEventListener: (_type: 'visibilitychange', fn: () => void) => {
      listeners.add(fn);
    },
    removeEventListener: (_type: 'visibilitychange', fn: () => void) => {
      listeners.delete(fn);
    },
  };
  return {
    page,
    turn: (state: DocumentVisibilityState) => {
      page.visibilityState = state;
      listeners.forEach((fn) => fn());
    },
  };
}

/** Wake locks that record every request, and which of them were given back. */
function fakeLocks(refuse = false) {
  const requested: string[] = [];
  const released: number[] = [];
  return {
    locks: {
      request: (type: 'screen') => {
        const nth = requested.push(type) - 1;
        if (refuse) return Promise.reject(new DOMException('low battery', 'NotAllowedError'));
        return Promise.resolve({
          release: () => {
            released.push(nth);
            return Promise.resolve();
          },
        });
      },
    },
    requested,
    released,
  };
}

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

  it('asks again when the page comes back, the system having taken the lock', () => {
    // Arrange
    const { page, turn } = fakePage('visible');
    const { locks, requested } = fakeLocks();
    keepAwake(page, locks);
    turn('hidden');

    // Act
    turn('visible');

    // Assert
    expect(requested).toEqual(['screen', 'screen']);
  });

  it('asks again after a refusal', () => {
    // Arrange
    const { page, turn } = fakePage('visible');
    const { locks, requested } = fakeLocks(true);
    keepAwake(page, locks);
    turn('hidden');

    // Act
    turn('visible');

    // Assert
    expect(requested).toEqual(['screen', 'screen']);
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

  it('does nothing where there are no wake locks', async () => {
    // Arrange
    const { page } = fakePage('visible');
    const dispose = keepAwake(page, undefined);

    // Act
    const disposed = await dispose();

    // Assert
    expect(disposed).toBeUndefined();
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
