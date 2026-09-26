import { createSignal } from 'solid-js';

import type { Vec2 } from '../lib/geo';
import type { CoastData } from '../lib/mapdata';
import type { ListSort } from './listSort';
import { aero } from './mapsets';
import { type PanelId, persisted } from './settings';

export type { PanelId };
/** The enabled map sets merged; see `mapsets`. */
export { aero };
export { declination, setDeclination } from './magnetic';
import type { Fix } from './track';

/** Feed liveness, as readsb reports it; the scope keeps no timer of its own beyond "when did we last hear". */
export type FeedStatus =
  | { kind: 'connecting' }
  | { kind: 'rx'; lastAt: number }
  | { kind: 'stale'; lastAt: number }
  | { kind: 'dead'; message: string; since: number };

export interface Site {
  lat: number;
  lon: number;
}

export type RblAnchor = { kind: 'target'; hex: string } | { kind: 'free'; x: number; y: number };

export interface Rbl {
  a: RblAnchor;
  b: RblAnchor;
  tag: string;
}

export type RblPending = { a: RblAnchor | null };

export type RangeCursorOrigin =
  | { kind: 'target'; hex: string }
  | { kind: 'fix'; x: number; y: number; name: string }
  | { kind: 'free'; x: number; y: number };

export const [site, setSite] = createSignal<Site | null>(null);
/** True once receiver.json has been read, whether or not it carried a position. */
export const [receiverAnswered, setReceiverAnswered] = createSignal(false);
/** Bumped whenever the projection is (re)configured; projected geometry must be rebuilt. */
const [projectionVersionSignal, setProjectionVersion] = createSignal(0);
export const projectionVersion = projectionVersionSignal;
export const bumpProjection = (): void => {
  setProjectionVersion((v) => v + 1);
};
export const [feedStatus, setFeedStatus] = createSignal<FeedStatus>({ kind: 'connecting' });
/** Bumped on every snapshot; coarse-grained reactivity over the track store. */
const [snapshotVersionSignal, setSnapshotVersion] = createSignal(0);
export const snapshotVersion = snapshotVersionSignal;
export const bumpSnapshot = (): void => {
  setSnapshotVersion((v) => v + 1);
};
export const [selected, setSelected] = createSignal<string | null>(null);
/** Today's readsb trace for the selected target, projected; null when none. */
export const [selectedTrace, setSelectedTrace] = createSignal<{ hex: string; fixes: Fix[] } | null>(
  null,
);
export const [hovered, setHovered] = createSignal<string | null>(null);
/** Pan offset from the site, in NM. */
export const [pan, setPan] = createSignal<Vec2>({ x: 0, y: 0 });
export const [canvasSize, setCanvasSize] = createSignal({ width: 1, height: 1, dpr: 1 });
export const [mouse, setMouse] = createSignal<{ cx: number; cy: number } | null>(null);
export const [rbls, setRbls] = createSignal<Rbl[]>([]);
export const [rblPending, setRblPending] = createSignal<RblPending | null>(null);
export const [rangeCursor, setRangeCursor] = createSignal<RangeCursorOrigin | null>(null);
const [panelsSignal, setPanels] = createSignal<Record<PanelId, boolean>>({ ...persisted.panels });
export const panels = panelsSignal;
export const [renderInfo, setRenderInfo] = createSignal<string>('');
export const [renderError, setRenderError] = createSignal<string | null>(null);

export function togglePanel(id: PanelId, force?: boolean): void {
  setPanels((p) => ({ ...p, [id]: force ?? !p[id] }));
}

export function nextRblTag(existing: readonly Rbl[]): string {
  const used = new Set(existing.map((r) => r.tag));
  for (const c of 'ABCDEFGHIJKLMNOP') if (!used.has(c)) return c;
  return '?';
}

export interface MenuItem {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  header?: boolean;
  separator?: boolean;
  checked?: boolean;
  onSelect?: () => void;
}

export interface Menu {
  x: number;
  y: number;
  items: MenuItem[];
}

export const [menu, setMenu] = createSignal<Menu | null>(null);
export const [listSort, setListSort] = createSignal<ListSort>({ ...persisted.listSort });
/** Data block being dragged by the operator; offset from its target in CSS px. */
export const [labelDrag, setLabelDrag] = createSignal<{
  hex: string;
  dx: number;
  dy: number;
} | null>(null);
export const [hintVisible, setHintVisible] = createSignal(false);
/** RBL anchor prompt shown center-top; null when idle. */
export const [modeText, setModeText] = createSignal<string | null>(null);
/** One-hertz wall clock for the top bar and feed staleness. */
export const [tick, setTick] = createSignal(Date.now());
export const [coast, setCoast] = createSignal<CoastData>({ lines: [] });
