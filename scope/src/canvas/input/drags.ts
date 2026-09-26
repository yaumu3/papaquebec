import { nearestCorner } from '../../render/layout/labels';
import type { View } from '../../render/protocol';
import {
  bumpSnapshot,
  pan,
  rblPending,
  rbls,
  setLabelDrag,
  setModeText,
  setPointer,
  setPan,
  setRblPending,
  setRbls,
} from '../../state/scope';
import { trackStore } from '../../state/tracks';
import { anchorAt, blockAt, targetAt, targetScreen } from '../hit';
import { appendRbl } from '../rbl';
import type { Precision } from './actions';
import { DRAG_THRESHOLD_PX, type Point } from './geometry';

export interface DragHost {
  view: () => View;
  /** Shows what the drag is doing on the canvas cursor. */
  setCursor: (cursor: 'crosshair' | 'move' | 'grabbing') => void;
}

interface Drag {
  from: Point;
  moved: boolean;
}

const pastThreshold = (d: Drag, at: Point) =>
  Math.hypot(at.x - d.from.x, at.y - d.from.y) > DRAG_THRESHOLD_PX;

/**
 * The drag a primary press starts, whatever pressed: off a target it drags out an RBL, on a data
 * block it moves the block, elsewhere it pans. Nothing happens until it moves past the threshold.
 */
export function trackDrags(host: DragHost) {
  let panDrag: (Drag & { x: number; y: number }) | null = null;
  let blockDrag: (Drag & { hex: string; grabX: number; grabY: number }) | null = null;
  /** A drag that began on a target; once it moves it is a pending RBL anchored there. */
  let rblDrag: (Drag & { hex: string; precision: Precision }) | null = null;

  const start = (at: Point, precision: Precision) => {
    const v = host.view();
    const t = targetAt(v, at.x, at.y, precision.reach);
    if (t) {
      rblDrag = { hex: t.hex, from: at, moved: false, precision };
      return;
    }
    const hit = blockAt(v, at.x, at.y);
    const s = hit ? targetScreen(v, hit.hex) : null;
    if (hit && s) {
      blockDrag = {
        hex: hit.hex,
        grabX: at.x - (s.cx + hit.dx),
        grabY: at.y - (s.cy + hit.dy),
        from: at,
        moved: false,
      };
      return;
    }
    const p = pan();
    panDrag = { from: at, x: p.x, y: p.y, moved: false };
  };

  const move = (at: Point) => {
    if (rblDrag) {
      if (!rblDrag.moved && pastThreshold(rblDrag, at)) {
        rblDrag.moved = true;
        setRblPending({ a: { kind: 'target', hex: rblDrag.hex } });
        setModeText('RBL · RELEASE ON ANCHOR B');
      }
      if (rblDrag.moved) setPointer({ cx: at.x, cy: at.y });
    }
    if (blockDrag) {
      if (!blockDrag.moved && pastThreshold(blockDrag, at)) {
        blockDrag.moved = true;
        host.setCursor('grabbing');
      }
      const s = blockDrag.moved ? targetScreen(host.view(), blockDrag.hex) : null;
      if (s) {
        setLabelDrag({
          hex: blockDrag.hex,
          dx: at.x - blockDrag.grabX - s.cx,
          dy: at.y - blockDrag.grabY - s.cy,
        });
      }
    }
    if (panDrag) {
      if (!panDrag.moved && pastThreshold(panDrag, at)) {
        panDrag.moved = true;
        host.setCursor('move');
      }
      if (!panDrag.moved) return;
      const k = host.view().pxPerNm;
      setPan({
        x: panDrag.x - (at.x - panDrag.from.x) / k,
        y: panDrag.y + (at.y - panDrag.from.y) / k,
      });
    }
  };

  /** Ends the drag at `at`; true when it moved, so it was a drag and not a tap. */
  const end = (at: Point): boolean => {
    let swallow = false;
    if (panDrag) {
      swallow = panDrag.moved;
      panDrag = null;
      host.setCursor('crosshair');
    }
    if (rblDrag) {
      const drag = rblDrag;
      rblDrag = null;
      if (drag.moved) {
        swallow = true;
        // Escape mid-drag clears the pending anchor, and with it the line.
        const a = rblPending()?.a;
        if (a) {
          setRbls(appendRbl(rbls(), a, anchorAt(host.view(), at.x, at.y, drag.precision.snap)));
        }
        setRblPending(null);
        setModeText(null);
        if (!drag.precision.hovers) setPointer(null);
      }
    }
    if (blockDrag) {
      const drag = blockDrag;
      blockDrag = null;
      host.setCursor('crosshair');
      const s = targetScreen(host.view(), drag.hex);
      const t = trackStore.tracks.get(drag.hex);
      if (drag.moved && s && t) {
        t.ops.pinnedCorner = nearestCorner(at.x - drag.grabX - s.cx, at.y - drag.grabY - s.cy);
        swallow = true;
        bumpSnapshot();
      }
      setLabelDrag(null);
    }
    return swallow;
  };

  /** Drops any drag without finishing it, as when a zoom takes over. */
  const cancel = () => {
    panDrag = null;
    blockDrag = null;
    if (rblDrag?.moved) {
      setRblPending(null);
      setModeText(null);
    }
    rblDrag = null;
    setLabelDrag(null);
    host.setCursor('crosshair');
  };

  return { start, move, end, cancel };
}
