import { describe, expect, it } from 'bun:test';

import { recordActions } from '../recordActions';
import {
  LANES_SELECTOR,
  type KeyEvent,
  keyHandler,
  ND_SELECTOR,
  TABLIST_SELECTOR,
} from './keyboard';

const key = (k: string, shiftKey = false, target: KeyEvent['target'] = null): KeyEvent => ({
  key: k,
  shiftKey,
  target,
});

describe('keyHandler', () => {
  it('asks for the action bound to each key, in either case', () => {
    // Arrange
    const { calls, actions } = recordActions();
    const onKey = keyHandler(actions);
    const presses = ['Escape', '?', '[', ']', 't', 'V', 'l', 'R', 'Home', 'x'];

    // Act
    for (const k of presses) onKey(key(k));

    // Assert
    expect(calls).toEqual([
      ['cancel'],
      ['toggleHint'],
      ['stepRange', -1],
      ['stepRange', 1],
      ['cycleTrails'],
      ['cycleVectors'],
      ['toggleList'],
      ['startRbl'],
      ['recenter'],
    ]);
  });

  it('deletes the last RBL, or all of them with Shift', () => {
    // Arrange
    const { calls, actions } = recordActions();
    const onKey = keyHandler(actions);
    const presses = [key('Delete'), key('Backspace'), key('Delete', true)];

    // Act
    for (const press of presses) onKey(press);

    // Assert
    expect(calls).toEqual([['deleteLastRbl'], ['deleteLastRbl'], ['clearRbls']]);
  });

  it('ignores keys typed into an input', () => {
    // Arrange
    const { calls, actions } = recordActions();
    const onKey = keyHandler(actions);
    const input = Object.assign(new EventTarget(), { tagName: 'INPUT' });

    // Act
    onKey(key(']', false, input));

    // Assert
    expect(calls).toEqual([]);
  });

  it('leaves keys pressed inside the lanes to it', () => {
    // Arrange
    const { calls, actions } = recordActions();
    const onKey = keyHandler(actions);
    const inLanes = Object.assign(new EventTarget(), {
      tagName: 'DIV',
      closest: (selector: string) => (selector === LANES_SELECTOR ? {} : null),
    });
    const presses = ['Delete', 'Backspace', 'Escape'].map((k) => key(k, false, inLanes));

    // Act
    for (const press of presses) onKey(press);

    // Assert
    expect(calls).toEqual([]);
  });

  it('leaves keys pressed on a tab list to it', () => {
    // Arrange
    const { calls, actions } = recordActions();
    const onKey = keyHandler(actions);
    const onTabs = Object.assign(new EventTarget(), {
      tagName: 'BUTTON',
      closest: (selector: string) => (selector === TABLIST_SELECTOR ? {} : null),
    });
    const presses = ['Home', 'ArrowLeft', 'Escape'].map((k) => key(k, false, onTabs));

    // Act
    for (const press of presses) onKey(press);

    // Assert
    expect(calls).toEqual([]);
  });

  it('leaves keys pressed on the ND to it', () => {
    // Arrange
    const { calls, actions } = recordActions();
    const onKey = keyHandler(actions);
    const onNd = Object.assign(new EventTarget(), {
      tagName: 'BUTTON',
      closest: (selector: string) => (selector === ND_SELECTOR ? {} : null),
    });
    const presses = ['Home', ']', 'Escape'].map((k) => key(k, false, onNd));

    // Act
    for (const press of presses) onKey(press);

    // Assert
    expect(calls).toEqual([]);
  });

  it('takes keys pressed elsewhere on the page', () => {
    // Arrange
    const { calls, actions } = recordActions();
    const onKey = keyHandler(actions);
    const elsewhere = Object.assign(new EventTarget(), { tagName: 'DIV', closest: () => null });

    // Act
    onKey(key('Escape', false, elsewhere));

    // Assert
    expect(calls).toEqual([['cancel']]);
  });
});
