import { describe, expect, it } from 'bun:test';

import {
  activeSheet,
  closeSheet,
  cycleDetent,
  cycleSheet,
  type Detent,
  detentFor,
  isShown,
  keepUnscrolled,
  largestDetent,
  nextSheet,
  setActiveSheet,
  setSheetDetent,
  sheetDetent,
  toggleSheet,
} from './layout';

const BOTH: [Detent, Detent] = ['medium', 'large'];
const LARGE: [Detent] = ['large'];

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

describe('toggleSheet', () => {
  it('takes the sheet from the open panel for the one whose tab is tapped', () => {
    // Arrange
    setActiveSheet('list');

    // Act
    toggleSheet('maps');

    // Assert
    expect(activeSheet()).toBe('maps');
  });
});

describe('closeSheet', () => {
  it('takes the sheet from the panel that holds it', () => {
    // Arrange
    setActiveSheet('list');

    // Act
    closeSheet();

    // Assert
    expect(activeSheet()).toBeNull();
  });
});

describe('isShown', () => {
  it('shows a panel on a phone while it holds the sheet, whatever its own toggle says', () => {
    // Arrange
    const cases: [string | null, boolean][] = [
      ['list', false],
      ['maps', true],
      [null, true],
    ];

    // Act
    const out = cases.map(([sheet, toggled]) => isShown(true, sheet, 'list', toggled));

    // Assert
    expect(out).toEqual([true, false, false]);
  });

  it('shows a panel elsewhere while its own toggle is on, whatever holds the sheet', () => {
    // Arrange
    const cases: [string | null, boolean][] = [
      ['list', false],
      ['maps', true],
      [null, true],
    ];

    // Act
    const out = cases.map(([sheet, toggled]) => isShown(false, sheet, 'list', toggled));

    // Assert
    expect(out).toEqual([false, true, true]);
  });
});

describe('detentFor', () => {
  it('keeps the detent the sheet rests at when the panel has it, else takes the smallest the panel has', () => {
    // Arrange
    const cases: [[Detent, ...Detent[]], Detent | null][] = [
      [BOTH, null],
      [LARGE, null],
      [BOTH, 'large'],
      [LARGE, 'medium'],
    ];

    // Act
    const out = cases.map(([detents, resting]) => detentFor(detents, resting));

    // Assert
    expect(out).toEqual(['medium', 'large', 'large', 'large']);
  });
});

describe('largestDetent', () => {
  it('takes the last of the detents, which run smallest first', () => {
    // Arrange
    const cases = [BOTH, LARGE];

    // Act
    const out = cases.map(largestDetent);

    // Assert
    expect(out).toEqual(['large', 'large']);
  });
});

describe('cycleDetent', () => {
  it('goes one detent up, and from the largest back to the smallest', () => {
    // Arrange
    const cases: [[Detent, ...Detent[]], Detent][] = [
      [BOTH, 'medium'],
      [BOTH, 'large'],
      [LARGE, 'large'],
    ];

    // Act
    const out = cases.map(([detents, current]) => cycleDetent(detents, current));

    // Assert
    expect(out).toEqual(['large', 'medium', 'large']);
  });
});

describe('opening the sheet', () => {
  it('opens each panel at its smallest detent', () => {
    // Arrange
    const ids = ['list', 'detail', 'display', 'maps'] as const;

    // Act
    const out = ids.map((id) => {
      closeSheet();
      toggleSheet(id);
      return sheetDetent();
    });

    // Assert
    expect(out).toEqual(['medium', 'medium', 'large', 'large']);
  });

  it('keeps the sheet large when it passes to a panel that can be large', () => {
    // Arrange
    setActiveSheet('maps');
    setSheetDetent('large');

    // Act
    toggleSheet('list');

    // Assert
    expect(sheetDetent()).toBe('large');
  });

  it('fills the screen when the sheet passes to a panel that only fills it', () => {
    // Arrange
    setActiveSheet('list');
    setSheetDetent('medium');

    // Act
    toggleSheet('display');

    // Assert
    expect(sheetDetent()).toBe('large');
  });
});

describe('cycleSheet', () => {
  it('takes the open sheet to its next detent', () => {
    // Arrange
    setActiveSheet('detail');
    setSheetDetent('large');

    // Act
    cycleSheet();

    // Assert
    expect(sheetDetent()).toBe('medium');
  });
});
