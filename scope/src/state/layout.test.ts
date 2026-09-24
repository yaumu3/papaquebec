import { describe, expect, it } from 'bun:test';

import { keepUnscrolled, nextSheet } from './layout';

/** A window whose resize listeners can be fired by hand, recording every scrollTo. */
function fakeWindow(scrollY: number) {
  const listeners = new Set<() => void>();
  const scrolls: [number, number][] = [];
  return {
    win: {
      scrollX: 0,
      scrollY,
      scrollTo: (x: number, y: number) => {
        scrolls.push([x, y]);
      },
      addEventListener: (_type: 'resize', fn: () => void) => {
        listeners.add(fn);
      },
      removeEventListener: (_type: 'resize', fn: () => void) => {
        listeners.delete(fn);
      },
    },
    resize: () => listeners.forEach((fn) => fn()),
    scrolls,
  };
}

describe('keepUnscrolled', () => {
  it('scrolls a window back to the origin when a resize leaves it offset', () => {
    // Arrange
    const { win, resize, scrolls } = fakeWindow(62);
    keepUnscrolled(win);

    // Act
    resize();

    // Assert
    expect(scrolls).toEqual([[0, 0]]);
  });

  it('leaves a window alone when a resize finds it at the origin', () => {
    // Arrange
    const { win, resize, scrolls } = fakeWindow(0);
    keepUnscrolled(win);

    // Act
    resize();

    // Assert
    expect(scrolls).toEqual([]);
  });

  it('stops listening once disposed', () => {
    // Arrange
    const { win, resize, scrolls } = fakeWindow(62);
    const dispose = keepUnscrolled(win);
    dispose();

    // Act
    resize();

    // Assert
    expect(scrolls).toEqual([]);
  });
});

describe('nextSheet', () => {
  it('opens the tapped panel, closes it when tapped again, and swaps between panels', () => {
    // Arrange
    const steps: [string | null, string][] = [
      [null, 'list'],
      ['list', 'list'],
      ['list', 'detail'],
    ];

    // Act
    const out = steps.map(([current, tapped]) => nextSheet(current, tapped));

    // Assert
    expect(out).toEqual(['list', null, 'detail']);
  });
});
