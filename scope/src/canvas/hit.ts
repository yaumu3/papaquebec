import { distanceToSegment, type ProjectFn, type UnprojectFn } from '../lib/geo';
import { blockCorner, labelOffset, labelRect } from '../render/layout/labels';
import type { View } from '../render/protocol';
import { extraLines } from '../render/scene/datablock';
import { anchorPoint, rblPath } from '../render/scene/overlays';
import { toScreen, toWorld } from '../render/scene/view';
import { aero, isFiltered, type Rbl, type RblAnchor, rbls } from '../state/scope';
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
    if (p.kind !== 'live' && p.kind !== 'last') continue;
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
  if (!p || (p.kind !== 'live' && p.kind !== 'last')) return null;
  return toScreen(view, p.x, p.y);
}

export interface BlockHit {
  hex: string;
  /** Current block offset from its target, CSS px. */
  dx: number;
  dy: number;
}

/** The data block under a screen point, if any; the selected target's block counts even when filtered, as it is drawn. */
export function blockAt(view: View, cx: number, cy: number): BlockHit | null {
  for (const t of trackStore.tracks.values()) {
    const s = targetScreen(view, t.hex);
    if (!s || isFiltered(t)) continue;
    const corner = blockCorner(t.ops);
    const r = labelRect(s.cx, s.cy, corner, extraLines(t));
    if (cx >= r.x0 && cx <= r.x1 && cy >= r.y0 && cy <= r.y1)
      return { hex: t.hex, ...labelOffset(corner) };
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

export function fixAt(
  view: View,
  cx: number,
  cy: number,
): { name: string; x: number; y: number } | null {
  if (!settings.layers.waypoints && !settings.layers.navaids) return null;
  const w = toWorld(view, cx, cy);
  const reach = FIX_PX / view.pxPerNm;
  let best: { name: string; x: number; y: number } | null = null;
  let bestD = reach * reach;
  const fixes = [
    ...(settings.layers.waypoints ? aero().waypoints : []),
    ...(settings.layers.navaids ? aero().navaids : []),
  ];
  for (const f of fixes) {
    const p = projectNm(f.lat, f.lon);
    const d = (p.x - w.x) ** 2 + (p.y - w.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = { name: f.id, ...p };
    }
  }
  return best;
}
