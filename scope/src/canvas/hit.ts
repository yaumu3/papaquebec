import type { Chart } from '../lib/chart';
import { blockHeight, DB_WIDTH, type Rect } from '../lib/datablock';
import { distanceToSegment, type ProjectFn, type UnprojectFn, type Vec2 } from '../lib/geo';
import type { ScopeLayer } from '../lib/layers';
import type { Offset } from '../render/layout/moves';
import type { View } from '../render/protocol';
import { extraLines } from '../render/scene/datablock';
import { anchorPoint, rblPath } from '../render/scene/rbl';
import { restingOffset } from '../render/scene/targets';
import { toScreen, toWorld } from '../render/scene/view';
import { chart } from '../state/mapsets';
import { drawnBlocks, isFiltered, type Rbl, type RblAnchor, rbls } from '../state/scope';
import { settings } from '../state/settings';
import type { Track } from '../state/track';
import { projectNm, trackStore, unprojectNm } from '../state/tracks';
import { anchorFor } from './rbl';

export const TARGET_PX = 14;
/** An RBL end this close to a target snaps onto it, as the pending line draws it. */
export const RBL_SNAP_PX = 15;
const FIX_PX = 10;

/** Nearest drawn target within reach of a screen point; filtered diamonds count too. */
export function targetAt(view: View, cx: number, cy: number, reachPx = TARGET_PX): Track | null {
  let best: Track | null = null;
  let bestD = reachPx * reachPx;
  for (const t of trackStore.tracks.values()) {
    const p = t.position;
    if (p.kind !== 'live') continue;
    const s = toScreen(view, p.x, p.y);
    const d = (s.cx - cx) ** 2 + (s.cy - cy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}

/** The RBL anchor under a screen point: a target within `reach`, else the point itself. */
export function anchorAt(v: View, cx: number, cy: number, reach: number): RblAnchor {
  return anchorFor(targetAt(v, cx, cy, reach), toWorld(v, cx, cy));
}

/** Screen position of a track, or null when it has none. */
export function targetScreen(view: View, hex: string): { cx: number; cy: number } | null {
  const p = trackStore.tracks.get(hex)?.position;
  if (!p || p.kind !== 'live') return null;
  return toScreen(view, p.x, p.y);
}

/** A block's rectangle for its target at `cx, cy`: where it was last drawn, else at its bearing. */
export function drawnBlockRect(t: Track, cx: number, cy: number, last: Offset | undefined): Rect {
  const { dx, dy } = last ?? restingOffset(t);
  return {
    x0: cx + dx,
    y0: cy + dy,
    x1: cx + dx + DB_WIDTH,
    y1: cy + dy + blockHeight(extraLines(t)),
  };
}

export interface BlockHit {
  hex: string;
  /** Offset from the target to the block's top-left corner, CSS px. */
  dx: number;
  dy: number;
}

/** The data block under a screen point, if any; the selected target's block counts even when filtered, as it is drawn. */
export function blockAt(view: View, cx: number, cy: number): BlockHit | null {
  for (const t of trackStore.tracks.values()) {
    const s = targetScreen(view, t.hex);
    if (!s || isFiltered(t)) continue;
    const r = drawnBlockRect(t, s.cx, s.cy, drawnBlocks.get(t.hex));
    if (cx >= r.x0 && cx <= r.x1 && cy >= r.y0 && cy <= r.y1)
      return { hex: t.hex, dx: r.x0 - s.cx, dy: r.y0 - s.cy };
  }
  return null;
}

const RBL_PX = 6;

/** What an RBL's ends are resolved and drawn with. */
export interface RblPlane {
  tracks: Map<string, Track>;
  project: ProjectFn;
  unproject: UnprojectFn;
}

/** The first of `lines` whose drawn path passes within reach of a screen point. */
export function rblNear(
  lines: readonly Rbl[],
  view: View,
  cx: number,
  cy: number,
  plane: RblPlane,
): Rbl | null {
  const p = { x: cx, y: cy };
  return (
    lines.find((r) => {
      const a = anchorPoint(r.a, plane);
      const b = anchorPoint(r.b, plane);
      if (!a || !b) return false;
      const path = rblPath(a, b, plane.project).map((w) => {
        const s = toScreen(view, w.x, w.y);
        return { x: s.cx, y: s.cy };
      });
      return path.some((q, i) => {
        const prev = path[i - 1];
        return prev !== undefined && distanceToSegment(p, prev, q) <= RBL_PX;
      });
    }) ?? null
  );
}

/** The range/bearing line under a screen point, if any. */
export function rblAt(view: View, cx: number, cy: number): Rbl | null {
  return rblNear(rbls(), view, cx, cy, {
    tracks: trackStore.tracks,
    project: projectNm,
    unproject: unprojectNm,
  });
}

/** The layers whose points the range cursor snaps onto. */
const SNAP_LAYERS: ReadonlySet<ScopeLayer> = new Set(['fix', 'vfr', 'navaid']);

/** The point of a shown fix, VFR point or navaid nearest `at`, if any is within `reach`. */
export function fixNear(
  items: Chart,
  shown: (layer: ScopeLayer) => boolean,
  at: Vec2,
  reach: number,
  project: ProjectFn,
): { name: string; x: number; y: number } | null {
  let best: { name: string; x: number; y: number } | null = null;
  let bestD = reach * reach;
  for (const item of items) {
    if (!SNAP_LAYERS.has(item.layer) || !shown(item.layer)) continue;
    for (const { geometry, properties } of item.parts) {
      if (geometry.type !== 'Point' || !('id' in properties)) continue;
      const [lon, lat] = geometry.coordinates;
      const p = project(lat, lon);
      const d = (p.x - at.x) ** 2 + (p.y - at.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { name: properties.id, ...p };
      }
    }
  }
  return best;
}

export function fixAt(
  view: View,
  cx: number,
  cy: number,
): { name: string; x: number; y: number } | null {
  const reach = FIX_PX / view.pxPerNm;
  return fixNear(chart(), (l) => settings.shownLayers[l], toWorld(view, cx, cy), reach, projectNm);
}
