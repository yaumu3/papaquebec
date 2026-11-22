import { describe, expect, it } from 'bun:test';

import { recordActions } from '../recordActions';
import { type KeyEvent, keyHandler, LANES_SELECTOR, ND_SELECTOR, panelTip } from './keyboard';

const key = (k: string, shiftKey = false, target: KeyEvent['target'] = null): KeyEvent => ({
  preventDefault: () => {},
  key: k,
  shiftKey,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  defaultPrevented: false,
  target,
});

describe('keyHandler', () => {
  it('asks for the action bound to each key, in either case', () => {
    // Arrange
    const { calls, actions } = recordActions();
    const onKey = keyHandler(actions);
    const presses = ['Escape', '?', '+', '-', 't', 'V', 'R', 'Home', 'i', '/', '[', ']'];

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
      ['startRbl'],
      ['recenter'],
      ['toggleAbout'],
      ['searchMaps'],
    ]);
  });

  it("toggles each panel with its digit, in the bars' order", () => {
    // Arrange
    const { calls, actions } = recordActions();
    const onKey = keyHandler(actions);
    const presses = ['1', '2', '3', '4', '5', 'l'];

    // Act
    for (const k of presses) onKey(key(k));

    // Assert
    expect(calls).toEqual([
      ['togglePanel', 'display'],
      ['togglePanel', 'maps'],
      ['togglePanel', 'list'],
      ['togglePanel', 'detail'],
    ]);
  });

  it('steps the selection with the up and down arrows', () => {
    // Arrange
    const { calls, actions } = recordActions();
    const onKey = keyHandler(actions);
    const presses = ['ArrowDown', 'ArrowUp', 'ArrowLeft'];

    // Act
    for (const k of presses) onKey(key(k));

    // Assert
    expect(calls).toEqual([
      ['stepSelection', 1],
      ['stepSelection', -1],
    ]);
  });

  it('keeps a key it handles from the browser, and no other', () => {
    // Arrange
    const { actions } = recordActions();
    const onKey = keyHandler(actions);
    const kept: string[] = [];
    const press = (k: string): KeyEvent =>
      Object.assign(key(k), { preventDefault: () => kept.push(k) });
    const presses = [press('ArrowDown'), press('x')];

    // Act
    for (const pressed of presses) onKey(pressed);

    // Assert
    expect(kept).toEqual(['ArrowDown']);
  });

  it('leaves a key another handler has already taken', () => {
    // Arrange
    const { calls, actions } = recordActions();
    const onKey = keyHandler(actions);
    const taken = { ...key('ArrowDown'), defaultPrevented: true };

    // Act
    onKey(taken);

    // Assert
    expect(calls).toEqual([]);
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

  it('leaves a chord with Ctrl, Cmd or Alt to the browser', () => {
    // Arrange
    const { calls, actions } = recordActions();
    const onKey = keyHandler(actions);
    const chords: KeyEvent[] = [
      { ...key('r'), altKey: true },
      { ...key('r'), ctrlKey: true },
      { ...key('r'), metaKey: true },
    ];

    // Act
    for (const chord of chords) onKey(chord);

    // Assert
    expect(calls).toEqual([]);
  });

  it('ignores keys typed into an input', () => {
    // Arrange
    const { calls, actions } = recordActions();
    const onKey = keyHandler(actions);
    const input = Object.assign(new EventTarget(), { tagName: 'INPUT' });

    // Act
    onKey(key('-', false, input));

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

  it('leaves keys pressed on the ND to it', () => {
    // Arrange
    const { calls, actions } = recordActions();
    const onKey = keyHandler(actions);
    const onNd = Object.assign(new EventTarget(), {
      tagName: 'BUTTON',
      closest: (selector: string) => (selector === ND_SELECTOR ? {} : null),
    });
    const presses = ['Home', '-', 'Escape'].map((k) => key(k, false, onNd));

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

describe('panelTip', () => {
  it('names each panel with the key that toggles it', () => {
    // Arrange
    const ids = ['display', 'maps', 'list', 'detail'] as const;

    // Act
    const tips = ids.map(panelTip);

    // Assert
    expect(tips).toEqual(['DISPLAY · 1', 'MAPS · 2', 'LIST · 3', 'DETAIL · 4']);
  });
});
