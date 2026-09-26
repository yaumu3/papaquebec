import type { View } from '../../render/protocol';
import { toWorld } from '../../render/scene/view';
import {
  type RangeCursorOrigin,
  rblPending,
  rbls,
  setHintVisible,
  setHovered,
  setMenu,
  setModeText,
  setPointer,
  setPan,
  setRangeCursor,
  setRblPending,
  setRbls,
  setSelected,
  togglePanel,
} from '../../state/scope';
import {
  cycle,
  setRange,
  setSettings,
  settings,
  stepRange,
  TRAIL_STEPS,
  VECTOR_STEPS,
} from '../../state/settings';
import { anchorAt, blockAt, fixAt, rblAt, targetAt } from '../hit';
import { rblMenu, scopeMenu, targetMenu } from '../menus';
import { appendRbl } from '../rbl';
import { type DragHost, trackDrags } from './drags';
import { type Point, type Zoomed, zoomAbout, zoomMoving } from './geometry';

/** How exactly a pointer lands, and whether it shows where it is between presses. */
export interface Precision {
  /** How far from a target a press still hits it. */
  reach: number;
  /** How far from a target an RBL end snaps onto it. */
  snap: number;
  hovers: boolean;
}

/** Everything input can ask of the scope. Each device offers some of these through its gestures. */
export interface ScopeActions {
  /** Takes hold of what is under `at`: a target to drag an RBL from, a data block, or the scope. */
  grab: (at: Point, precision: Precision) => void;
  /** Moves what is held; nothing moves until it passes the drag threshold. */
  dragTo: (at: Point) => void;
  /** Lets go at `at`; true when it was a drag rather than a press. */
  release: (at: Point) => boolean;
  /** Lets go without finishing, as when a zoom takes over. */
  dropGrab: () => void;
  /** Selects what is under `at`, or places the next end of a pending RBL there. */
  tap: (at: Point, precision: Precision) => void;
  /** Opens the menu for what is under `at`: a target, an RBL, else the scope. */
  menu: (at: Point, precision: Precision) => void;
  dismissMenu: () => void;
  /** What a range cursor from `at` measures from: a target, a fix, else the point. */
  rangeOrigin: (at: Point) => RangeCursorOrigin;
  /** Shows a range cursor measuring from `origin`, or hides it when null. */
  showRange: (origin: RangeCursorOrigin | null) => void;
  /** A hovering pointer is at `at`, or has left the scope when null. */
  hover: (at: Point | null) => void;
  /** Remembers the view a continuous zoom scales from. */
  zoomStart: () => void;
  /** Scales the range from the zoom's start by `factor` about `anchor`, which moves to `to`. */
  zoomTo: (anchor: Point, factor: number, to: Point) => void;
  zoomEnd: () => void;
  /** Scales the current range by `factor` about `at`. */
  zoomBy: (at: Point, factor: number) => void;
  /** Steps the range to the next preset below (-1) or above (1). */
  stepRange: (direction: 1 | -1) => void;
  cycleTrails: () => void;
  cycleVectors: () => void;
  toggleList: () => void;
  toggleHint: () => void;
  /** Recentres the scope on the site. */
  recenter: () => void;
  /** Waits for the two ends of a new RBL. */
  startRbl: () => void;
  deleteLastRbl: () => void;
  clearRbls: () => void;
  /** Abandons a pending RBL or range cursor and closes the menu. */
  cancel: () => void;
}

function applyZoom(z: Zoomed) {
  setRange(z.rangeNm);
  setPan(z.pan);
}

/** The actions that need neither the view nor any state of their own. */
const plain = {
  dismissMenu: () => setMenu(null),
  showRange: (origin: RangeCursorOrigin | null) => setRangeCursor(origin),
  stepRange,
  cycleTrails: () => setSettings('trailSec', cycle(TRAIL_STEPS, settings.trailSec)),
  cycleVectors: () => setSettings('vectorMin', cycle(VECTOR_STEPS, settings.vectorMin)),
  toggleList: () => togglePanel('list'),
  toggleHint: () => setHintVisible((v) => !v),
  recenter: () => setPan({ x: 0, y: 0 }),
  startRbl: () => {
    setRblPending({ a: null });
    setModeText('RBL · SELECT ANCHOR A');
  },
  deleteLastRbl: () => setRbls(rbls().slice(0, -1)),
  clearRbls: () => setRbls([]),
  cancel: () => {
    setRblPending(null);
    setRangeCursor(null);
    setModeText(null);
    setMenu(null);
  },
} satisfies Partial<ScopeActions>;

/** The scope actions over the host's view. */
export function createActions(host: DragHost): ScopeActions {
  const { view } = host;
  const drags = trackDrags(host);
  /** The view and range a continuous zoom started from. */
  let zoomBase: { view: View; rangeNm: number } | null = null;

  const tap = (at: Point, precision: Precision) => {
    const v = view();
    const pending = rblPending();
    if (pending) {
      const anchor = anchorAt(v, at.x, at.y, precision.snap);
      if (!pending.a) {
        setRblPending({ a: anchor });
        setModeText('RBL · SELECT ANCHOR B');
      } else {
        setRbls(appendRbl(rbls(), pending.a, anchor));
        setRblPending(null);
        setModeText(null);
      }
      return;
    }
    const t = targetAt(v, at.x, at.y, precision.reach);
    setSelected(t ? t.hex : (blockAt(v, at.x, at.y)?.hex ?? null));
  };

  const menu = (at: Point, precision: Precision) => {
    const v = view();
    const t = targetAt(v, at.x, at.y, precision.reach);
    const r = t ? null : rblAt(v, at.x, at.y);
    setMenu({
      x: at.x,
      y: at.y,
      items: t ? targetMenu(t) : r ? rblMenu(r) : scopeMenu(toWorld(v, at.x, at.y)),
    });
  };

  const rangeOrigin = (at: Point): RangeCursorOrigin => {
    const v = view();
    const t = targetAt(v, at.x, at.y);
    const fix = t ? null : fixAt(v, at.x, at.y);
    return t
      ? { kind: 'target', hex: t.hex }
      : fix
        ? { kind: 'fix', ...fix }
        : { kind: 'free', ...toWorld(v, at.x, at.y) };
  };

  const hover = (at: Point | null) => {
    setPointer(at && { cx: at.x, cy: at.y });
    const t = at && targetAt(view(), at.x, at.y);
    setHovered(t ? t.hex : null);
  };

  const zoomStart = () => {
    zoomBase = { view: view(), rangeNm: settings.rangeNm };
  };
  const zoomEnd = () => {
    zoomBase = null;
  };

  const zoomTo = (anchor: Point, factor: number, to: Point) => {
    if (zoomBase) applyZoom(zoomMoving(zoomBase.view, zoomBase.rangeNm, anchor, factor, to));
  };

  const zoomBy = (at: Point, factor: number) => {
    const z = zoomAbout(view(), settings.rangeNm, at.x, at.y, factor);
    if (z.rangeNm !== settings.rangeNm) applyZoom(z);
  };

  return {
    ...plain,
    grab: drags.start,
    dragTo: drags.move,
    release: drags.end,
    dropGrab: drags.cancel,
    tap,
    menu,
    rangeOrigin,
    hover,
    zoomStart,
    zoomEnd,
    zoomTo,
    zoomBy,
  };
}
