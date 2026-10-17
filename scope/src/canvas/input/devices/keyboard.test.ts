import { describe, expect, it } from 'bun:test';

import { recordActions } from '../recordActions';
import { HISTORY_SELECTOR, type KeyEvent, keyHandler } from './keyboard';

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

  it('leaves keys pressed inside the history to it', () => {
    // Arrange
    const { calls, actions } = recordActions();
    const onKey = keyHandler(actions);
    const inHistory = Object.assign(new EventTarget(), {
      tagName: 'DIV',
      closest: (selector: string) => (selector === HISTORY_SELECTOR ? {} : null),
    });
    const presses = ['Delete', 'Backspace', 'Escape'].map((k) => key(k, false, inHistory));

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
