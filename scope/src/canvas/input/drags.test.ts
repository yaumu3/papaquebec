import { beforeEach, describe, expect, it } from 'bun:test';

import type { AircraftReport } from '../../lib/aircraft';
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
  setSelected,
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

const aircraft = (hex: string): AircraftReport => ({
  hex,
  position: { lat: 35.5, lon: 139.8 },
  seen: 0.2,
  seenPos: 0.2,
  alt: 11000,
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
    setSelected(null);
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

  it('drags an RBL out of the selected target and drops its far end where released', () => {
    // Arrange
    trackStore.ingest({ now: 1000, messages: 0, aircraft: [aircraft('d00123')] });
    setSelected('d00123');
    const { d } = subject();
    d.start({ x: 401, y: 300 }, precise);
    d.move({ x: 600, y: 200 });

    // Act
    const swallow = d.end({ x: 600, y: 200 });

    // Assert
    expect(swallow).toBe(true);
    expect(rbls().map(({ a, b }) => ({ a, b }))).toEqual([
      { a: { kind: 'target', hex: 'd00123' }, b: { kind: 'free', ...toWorld(view, 600, 200) } },
    ]);
    expect([rblPending(), modeText()]).toEqual([null, null]);
  });

  it('pans off a target that is not selected instead of dragging an RBL', () => {
    // Arrange
    trackStore.ingest({ now: 1000, messages: 0, aircraft: [aircraft('d00123')] });
    const { d } = subject();
    d.start({ x: 401, y: 300 }, precise);

    // Act
    d.move({ x: 600, y: 200 });

    // Assert
    expect(pan().x).toBeCloseTo(-199 / view.pxPerNm, 9);
    expect(pan().y).toBeCloseTo(-100 / view.pxPerNm, 9);
    expect([rblPending(), modeText(), rbls()]).toEqual([null, null, []]);
  });

  it('moves a dragged block where its leader points when released', () => {
    // Arrange
    trackStore.ingest({ now: 1000, messages: 0, aircraft: [aircraft('d00123')] });
    const { d } = subject();
    d.start({ x: 440, y: 265 }, precise); // inside the north-east block of the target at 400, 300
    d.move({ x: 410, y: 215 }); // the target under the block, leader straight up

    // Act
    const swallow = d.end({ x: 410, y: 215 });

    // Assert
    expect(swallow).toBe(true);
    expect(trackStore.tracks.get('d00123')?.ops.dir).toBe(6); // north
    expect(trackStore.tracks.get('d00123')?.ops.movedAt).toBe(1000);
    expect(trackStore.tracks.get('d00123')?.ops.manual).toBe(true);
  });

  it('drops a pending RBL when the drag is cancelled', () => {
    // Arrange
    trackStore.ingest({ now: 1000, messages: 0, aircraft: [aircraft('d00123')] });
    setSelected('d00123');
    const { d } = subject();
    d.start({ x: 401, y: 300 }, precise);
    d.move({ x: 600, y: 200 });

    // Act
    d.cancel();

    // Assert
    expect([rblPending(), modeText(), rbls()]).toEqual([null, null, []]);
  });
});
