import { beforeEach, describe, expect, it } from 'bun:test';

import type { AircraftJson } from '../../lib/aircraft';
import type { View } from '../../render/protocol';
import { toWorld } from '../../render/scene/view';
import {
  modeText,
  pan,
  rblPending,
  rbls,
  setModeText,
  setPan,
  setRblPending,
  setRbls,
} from '../../state/scope';
import { trackStore } from '../../state/tracks';
import { pxPerNmFor } from '../view';
import type { Precision } from './actions';
import { trackDrags } from './drags';

/** Without a site every position projects to the world origin, the middle of this view. */
const view: View = {
  centerX: 0,
  centerY: 0,
  pxPerNm: pxPerNmFor(800, 600, 40),
  widthPx: 800,
  heightPx: 600,
  dpr: 1,
};

/** A pointer that lands exactly and hovers. */
const precise: Precision = { reach: 14, snap: 15, hovers: true };

const aircraft = (hex: string): AircraftJson => ({
  hex,
  lat: 35.5,
  lon: 139.8,
  seen: 0.2,
  seen_pos: 0.2,
  alt_baro: 11000,
});

/** A drag tracker over the fixed view, recording every cursor it asks for. */
function subject() {
  const cursors: string[] = [];
  const d = trackDrags({ view: () => view, setCursor: (c) => cursors.push(c) });
  return { cursors, d };
}

describe('trackDrags', () => {
  beforeEach(() => {
    trackStore.ingest({ now: 1000, messages: 0, aircraft: [] });
    setPan({ x: 0, y: 0 });
    setRbls([]);
    setRblPending(null);
    setModeText(null);
  });

  it('pans with the pointer once it moves past the threshold', () => {
    // Arrange
    const { d } = subject();
    d.start({ x: 200, y: 150 }, precise);

    // Act
    d.move({ x: 240, y: 180 });

    // Assert
    expect(pan().x).toBeCloseTo(-40 / view.pxPerNm, 9);
    expect(pan().y).toBeCloseTo(30 / view.pxPerNm, 9);
  });

  it('lets the click through after a wobble within the threshold', () => {
    // Arrange
    const { d } = subject();
    d.start({ x: 200, y: 150 }, precise);
    d.move({ x: 203, y: 150 });

    // Act
    const swallow = d.end({ x: 203, y: 150 });

    // Assert
    expect(swallow).toBe(false);
    expect(pan()).toEqual({ x: 0, y: 0 });
  });

  it('swallows the click after a pan and restores the cursor', () => {
    // Arrange
    const { cursors, d } = subject();
    d.start({ x: 200, y: 150 }, precise);
    d.move({ x: 240, y: 150 });

    // Act
    const swallow = d.end({ x: 240, y: 150 });

    // Assert
    expect(swallow).toBe(true);
    expect(cursors).toEqual(['move', 'crosshair']);
  });

  it('drags an RBL out of a target and drops its far end where released', () => {
    // Arrange
    trackStore.ingest({ now: 1000, messages: 0, aircraft: [aircraft('abc123')] });
    const { d } = subject();
    d.start({ x: 401, y: 300 }, precise);
    d.move({ x: 600, y: 200 });

    // Act
    const swallow = d.end({ x: 600, y: 200 });

    // Assert
    expect(swallow).toBe(true);
    expect(rbls().map(({ a, b }) => ({ a, b }))).toEqual([
      { a: { kind: 'target', hex: 'abc123' }, b: { kind: 'free', ...toWorld(view, 600, 200) } },
    ]);
    expect([rblPending(), modeText()]).toEqual([null, null]);
  });

  it('drops a pending RBL when the drag is cancelled', () => {
    // Arrange
    trackStore.ingest({ now: 1000, messages: 0, aircraft: [aircraft('abc123')] });
    const { d } = subject();
    d.start({ x: 401, y: 300 }, precise);
    d.move({ x: 600, y: 200 });

    // Act
    d.cancel();

    // Assert
    expect([rblPending(), modeText(), rbls()]).toEqual([null, null, []]);
  });
});
