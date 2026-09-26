import { describe, expect, it } from 'bun:test';

import { recordActions } from '../recordActions';
import { type ButtonEvent, CURSOR, type MouseHandlers, mouseBindings, trackMouse } from './mouse';

const QUIET_MS = 20;

const left = (clientX: number, clientY: number): ButtonEvent => ({ button: 0, clientX, clientY });
const right = (clientX: number, clientY: number): ButtonEvent => ({ button: 2, clientX, clientY });

/** Handlers that record every call by name; a right press yields its position as the origin. */
function recorder() {
  const calls: [string, ...unknown[]][] = [];
  const h: MouseHandlers<string> = {
    press: (at) => calls.push(['press', at]),
    release: (at, cancelled) => calls.push(['release', at, cancelled]),
    rightPress: (at) => `origin ${at.x},${at.y}`,
    rangeStart: (origin) => calls.push(['rangeStart', origin]),
    rangeEnd: () => calls.push(['rangeEnd']),
    menu: (at) => calls.push(['menu', at]),
  };
  return { calls, m: trackMouse(h, QUIET_MS) };
}

describe('trackMouse', () => {
  it('presses on the left button only', () => {
    // Arrange
    const { calls, m } = recorder();

    // Act
    for (const e of [left(10, 20), right(30, 40), { button: 1, clientX: 0, clientY: 0 }]) m.down(e);

    // Assert
    expect(calls).toEqual([['press', { x: 10, y: 20 }]]);
  });

  it('starts the range cursor once the right button drags past the threshold', () => {
    // Arrange
    const { calls, m } = recorder();
    m.down(right(100, 100));

    // Act
    for (const x of [103, 110, 120]) m.move({ clientX: x, clientY: 100 });

    // Assert
    expect(calls).toEqual([['rangeStart', 'origin 100,100']]);
  });

  it('ends the range cursor when the right button comes up', () => {
    // Arrange
    const { calls, m } = recorder();
    m.down(right(100, 100));
    m.move({ clientX: 120, clientY: 100 });

    // Act
    m.up(right(120, 100));

    // Assert
    expect(calls.at(-1)).toEqual(['rangeEnd']);
  });

  it('holds a menu asked for during a right press and opens it on release', () => {
    // Arrange
    const { calls, m } = recorder();
    m.down(right(100, 100));
    m.contextMenu({ x: 100, y: 100 });

    // Act
    m.up(right(100, 100));

    // Assert
    expect(calls).toEqual([['menu', { x: 100, y: 100 }], ['rangeEnd']]);
  });

  it('drops a held menu when the right press turns into a drag', () => {
    // Arrange
    const { calls, m } = recorder();
    m.down(right(100, 100));
    m.contextMenu({ x: 100, y: 100 });
    m.move({ clientX: 120, clientY: 100 });

    // Act
    m.up(right(120, 100));

    // Assert
    expect(calls.some(([name]) => name === 'menu')).toBe(false);
  });

  it('opens a menu asked for outside a right press at once', () => {
    // Arrange
    const { calls, m } = recorder();

    // Act
    m.contextMenu({ x: 50, y: 60 });

    // Assert
    expect(calls).toEqual([['menu', { x: 50, y: 60 }]]);
  });

  it('swallows a menu asked for just after a right drag', () => {
    // Arrange
    const { calls, m } = recorder();
    m.down(right(100, 100));
    m.move({ clientX: 120, clientY: 100 });
    m.up(right(120, 100));

    // Act
    m.contextMenu({ x: 1, y: 1 });

    // Assert
    expect(calls.some(([name]) => name === 'menu')).toBe(false);
  });

  it('opens a menu again once the right drag has settled', async () => {
    // Arrange
    const { calls, m } = recorder();
    m.down(right(100, 100));
    m.move({ clientX: 120, clientY: 100 });
    m.up(right(120, 100));
    await Bun.sleep(QUIET_MS * 2);

    // Act
    m.contextMenu({ x: 2, y: 2 });

    // Assert
    expect(calls.at(-1)).toEqual(['menu', { x: 2, y: 2 }]);
  });

  it('releases a left press where the button comes up', () => {
    // Arrange
    const { calls, m } = recorder();
    m.down(left(10, 20));

    // Act
    m.up(left(40, 20));

    // Assert
    expect(calls).toEqual([
      ['press', { x: 10, y: 20 }],
      ['release', { x: 40, y: 20 }, false],
    ]);
  });

  it('ignores a left button that comes up without having gone down on the canvas', () => {
    // Arrange
    const { calls, m } = recorder();

    // Act
    m.up(left(40, 20));

    // Assert
    expect(calls).toEqual([]);
  });

  it('says when the browser cancelled the left press', () => {
    // Arrange
    const { calls, m } = recorder();
    m.down(left(10, 20));

    // Act
    m.up(left(10, 20), true);

    // Assert
    expect(calls.at(-1)).toEqual(['release', { x: 10, y: 20 }, true]);
  });
});

describe('mouseBindings', () => {
  const p = { x: 10, y: 20 };

  it('grabs on a press and taps on a release that did not drag', () => {
    // Arrange
    const { calls, actions } = recordActions();
    const b = mouseBindings(actions);
    b.press(p);

    // Act
    b.release(p, false);

    // Assert
    expect(calls).toEqual([
      ['grab', p, CURSOR],
      ['release', p],
      ['tap', p, CURSOR],
    ]);
  });

  it('does not tap after a drag or a cancelled press', () => {
    // Arrange
    const runs = [
      { rec: recordActions({ dragged: true }), cancelled: false },
      { rec: recordActions(), cancelled: true },
    ];

    // Act
    for (const r of runs) mouseBindings(r.rec.actions).release(p, r.cancelled);

    // Assert
    expect(runs.map((r) => r.rec.calls.some(([name]) => name === 'tap'))).toEqual([false, false]);
  });

  it('shows the range cursor from where the right button went down, and opens the menu', () => {
    // Arrange
    const { calls, actions } = recordActions();
    const b = mouseBindings(actions);
    const steps = [() => b.rangeStart(b.rightPress(p)), () => b.rangeEnd(), () => b.menu(p)];

    // Act
    for (const step of steps) step();

    // Assert
    expect(calls).toEqual([
      ['rangeOrigin', p],
      ['showRange', { kind: 'free', ...p }],
      ['showRange', null],
      ['menu', p, CURSOR],
    ]);
  });
});
