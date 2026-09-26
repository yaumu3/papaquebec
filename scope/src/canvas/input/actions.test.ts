import { beforeEach, describe, expect, it } from 'bun:test';

import type { AircraftJson } from '../../lib/aircraft';
import type { View } from '../../render/protocol';
import { toWorld } from '../../render/scene/view';
import {
  hintVisible,
  hovered,
  menu,
  modeText,
  pointer,
  pan,
  rangeCursor,
  rblPending,
  rbls,
  selected,
  setHovered,
  setMenu,
  setModeText,
  setPointer,
  setPan,
  setRangeCursor,
  setRblPending,
  setRbls,
  setSelected,
} from '../../state/scope';
import { setRange, setSettings, settings } from '../../state/settings';
import { trackStore } from '../../state/tracks';
import { scopeMenu, targetMenu } from '../menus';
import { pxPerNmFor } from '../view';
import { createActions, type Precision } from './actions';

/** Without a site every position projects to the world origin, the middle of this view. */
const view: View = {
  centerX: 0,
  centerY: 0,
  pxPerNm: pxPerNmFor(800, 600, 40),
  widthPx: 800,
  heightPx: 600,
  dpr: 1,
};

/** A pointer that lands exactly and hovers, and one that lands loosely and does not. */
const precise: Precision = { reach: 14, snap: 15, hovers: true };
const loose: Precision = { reach: 24, snap: 24, hovers: false };

const aircraft = (hex: string): AircraftJson => ({
  hex,
  lat: 35.5,
  lon: 139.8,
  seen: 0.2,
  seen_pos: 0.2,
  alt_baro: 11000,
});

const line = (tag: string) => ({
  a: { kind: 'free' as const, x: 0, y: 0 },
  b: { kind: 'free' as const, x: 1, y: 1 },
  tag,
});

/** Scope actions over the fixed view, ignoring the canvas cursor. */
const subject = () => createActions({ view: () => view, setCursor: () => {} });

const labels = (items: { label: string }[] | undefined) => items?.map((i) => i.label);

describe('createActions', () => {
  beforeEach(() => {
    trackStore.ingest({ now: 1000, messages: 0, aircraft: [aircraft('abc123')] });
    setRange(40);
    setSettings('trailSec', 0);
    setPan({ x: 0, y: 0 });
    setRangeCursor(null);
    setSelected(null);
    setRbls([]);
    setRblPending(null);
    setModeText(null);
    setMenu(null);
    setPointer(null);
    setHovered(null);
  });

  it('selects the target a tap lands within reach of, else clears the selection', () => {
    // Arrange
    const a = subject();
    const taps = [
      { at: { x: 420, y: 300 }, precision: loose },
      { at: { x: 420, y: 300 }, precision: precise },
    ];

    // Act
    const picked = taps.map((t) => {
      a.tap(t.at, t.precision);
      return selected();
    });

    // Assert
    expect(picked).toEqual(['abc123', null]);
  });

  it('places the first and then the second end of a pending RBL with taps', () => {
    // Arrange
    const a = subject();
    setRblPending({ a: null });
    const taps = [
      { x: 402, y: 300 },
      { x: 600, y: 200 },
    ];

    // Act
    for (const at of taps) a.tap(at, precise);

    // Assert
    expect(rbls().map(({ a: from, b: to }) => ({ from, to }))).toEqual([
      { from: { kind: 'target', hex: 'abc123' }, to: { kind: 'free', ...toWorld(view, 600, 200) } },
    ]);
    expect([rblPending(), modeText(), selected()]).toEqual([null, null, null]);
  });

  it('opens the target menu on a target and the scope menu elsewhere', () => {
    // Arrange
    const a = subject();
    const t = trackStore.tracks.get('abc123');
    const at = [
      { x: 405, y: 300 },
      { x: 600, y: 200 },
    ];

    // Act
    const opened = at.map((p) => {
      a.menu(p, precise);
      return menu();
    });

    // Assert
    expect(opened.map((m) => m && { x: m.x, y: m.y })).toEqual(at);
    expect(opened.map((m) => labels(m?.items))).toEqual([
      labels(t ? targetMenu(t) : []),
      labels(scopeMenu(toWorld(view, 600, 200))),
    ]);
  });

  it('measures a range cursor from the target under the pointer, else from the point', () => {
    // Arrange
    const a = subject();
    const at = [
      { x: 405, y: 300 },
      { x: 600, y: 200 },
    ];

    // Act
    const origins = at.map((p) => a.rangeOrigin(p));

    // Assert
    expect(origins).toEqual([
      { kind: 'target', hex: 'abc123' },
      { kind: 'free', ...toWorld(view, 600, 200) },
    ]);
  });

  it('tracks the hover position and the target under it, and forgets both on leave', () => {
    // Arrange
    const a = subject();
    const moves = [{ x: 405, y: 300 }, null];

    // Act
    const seen = moves.map((at) => {
      a.hover(at);
      return [pointer(), hovered()];
    });

    // Assert
    expect(seen).toEqual([
      [{ cx: 405, cy: 300 }, 'abc123'],
      [null, null],
    ]);
  });

  it('zooms from the range the zoom started at, not from the last step', () => {
    // Arrange
    const a = subject();
    const anchor = { x: 400, y: 300 };
    a.zoomStart();
    const factors = [0.5, 2];

    // Act
    const ranges = factors.map((f) => {
      a.zoomTo(anchor, f, anchor);
      return settings.rangeNm;
    });

    // Assert
    expect(ranges).toEqual([20, 80]);
  });

  it('ignores zoom moves outside a started zoom', () => {
    // Arrange
    const a = subject();
    a.zoomStart();
    a.zoomEnd();

    // Act
    a.zoomTo({ x: 400, y: 300 }, 2, { x: 400, y: 300 });

    // Assert
    expect(settings.rangeNm).toBe(40);
  });

  it('zooms by a step about a point', () => {
    // Arrange
    const a = subject();
    const before = toWorld(view, 600, 200);

    // Act
    a.zoomBy({ x: 600, y: 200 }, 0.8);

    // Assert
    expect(settings.rangeNm).toBeCloseTo(32, 9);
    const after = toWorld(
      {
        ...view,
        centerX: pan().x,
        centerY: pan().y,
        pxPerNm: pxPerNmFor(800, 600, settings.rangeNm),
      },
      600,
      200,
    );
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('steps the range down and up through the presets', () => {
    // Arrange
    const a = subject();
    const directions = [-1, 1, 1] as const;

    // Act
    const ranges = directions.map((d) => {
      a.stepRange(d);
      return settings.rangeNm;
    });

    // Assert
    expect(ranges).toEqual([20, 40, 80]);
  });

  it('abandons a pending RBL and a range cursor and closes the menu on cancel', () => {
    // Arrange
    const a = subject();
    setRblPending({ a: null });
    setModeText('RBL · SELECT ANCHOR A');
    setRangeCursor({ kind: 'free', x: 1, y: 1 });
    setMenu({ x: 0, y: 0, items: [] });

    // Act
    a.cancel();

    // Assert
    expect([rblPending(), modeText(), rangeCursor(), menu()]).toEqual([null, null, null, null]);
  });

  it('waits for the first end of a new RBL', () => {
    // Arrange
    const a = subject();

    // Act
    a.startRbl();

    // Assert
    expect(rblPending()).toEqual({ a: null });
    expect(modeText()).toBe('RBL · SELECT ANCHOR A');
  });

  it('deletes the last RBL, or all of them', () => {
    // Arrange
    const a = subject();
    const deletes = [a.deleteLastRbl, a.clearRbls];

    // Act
    const left = deletes.map((del) => {
      setRbls([line('1'), line('2')]);
      del();
      return rbls();
    });

    // Assert
    expect(left).toEqual([[line('1')], []]);
  });

  it('cycles trails, toggles the hint and recentres', () => {
    // Arrange
    const a = subject();
    setPan({ x: 5, y: 5 });
    const hintBefore = hintVisible();

    // Act
    for (const act of [a.cycleTrails, a.toggleHint, a.recenter]) act();

    // Assert
    expect(settings.trailSec).toBe(30);
    expect(hintVisible()).toBe(!hintBefore);
    expect(pan()).toEqual({ x: 0, y: 0 });
  });

  it('pans with a grab dragged past the threshold, and says the release was a drag', () => {
    // Arrange
    const a = subject();
    a.grab({ x: 200, y: 150 }, precise);
    a.dragTo({ x: 240, y: 180 });

    // Act
    const dragged = a.release({ x: 240, y: 180 });

    // Assert
    expect(dragged).toBe(true);
    expect(pan().x).toBeCloseTo(-40 / view.pxPerNm, 9);
    expect(pan().y).toBeCloseTo(30 / view.pxPerNm, 9);
  });
});
