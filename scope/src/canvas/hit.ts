import { distanceToSegment } from '../lib/geo';
import { labelOffset, labelRect } from '../render/layout/labels';
import type { View } from '../render/protocol';
import { extraLines } from '../render/scene/rules';
import { toScreen, toWorld } from '../render/scene/view';
import { classify } from '../state/filter';
import { aero, type Rbl, type RblAnchor, rbls, selected } from '../state/scope';
import { settings } from '../state/settings';
import type { Track } from '../state/track';
import { projectNm, trackStore } from '../state/tracks';

const TARGET_PX = 14;
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

/** A filtered target draws no block, unless it is the selected one. */
const hidden = (t: Track) =>
  t.hex !== selected() && classify(t, settings.filter, settings.altimeter) === 'filtered';

/** The data block under a screen point, if any; the selected target's block counts even when filtered, as it is drawn. */
export function blockAt(view: View, cx: number, cy: number): BlockHit | null {
  for (const t of trackStore.tracks.values()) {
    const s = targetScreen(view, t.hex);
    if (!s || hidden(t)) continue;
    const corner = t.ops.pinnedCorner ?? t.ops.autoCorner;
    const r = labelRect(s.cx, s.cy, corner, extraLines(t));
    if (cx >= r.x0 && cx <= r.x1 && cy >= r.y0 && cy <= r.y1)
      return { hex: t.hex, ...labelOffset(corner) };
  }
  return null;
}

const RBL_PX = 6;

function anchorScreen(view: View, a: RblAnchor): { cx: number; cy: number } | null {
  if (a.kind === 'target') return targetScreen(view, a.hex);
  return toScreen(view, a.x, a.y);
}

/** The range/bearing line under a screen point, if any. */
export function rblAt(view: View, cx: number, cy: number): Rbl | null {
  const p = { x: cx, y: cy };
  for (const r of rbls()) {
    const a = anchorScreen(view, r.a);
    const b = anchorScreen(view, r.b);
    if (!a || !b) continue;
    if (distanceToSegment(p, { x: a.cx, y: a.cy }, { x: b.cx, y: b.cy }) <= RBL_PX) return r;
  }
  return null;
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
