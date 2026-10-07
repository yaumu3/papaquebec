import { createSignal } from 'solid-js';

import type { FeedDown } from '../feed/push';
import type { Vec2 } from '../lib/geo';
import type { CoastData } from '../lib/mapdata';
import { type Filterable, visibility } from './filter';
import type { ListSort } from './listSort';
import { aero } from './mapsets';
import { type PanelId, persisted, settings } from './settings';

export type { PanelId };
/** The enabled map sets merged; see `mapsets`. */
export { aero };
export { declination, magneticTrack, setDeclination } from './magnetic';

/** What the scope knows of the feed; `feedState` tells its state from this and the clock. */
export interface FeedStatus {
  /** When the last snapshot arrived; null before the first. */
  lastAt: number | null;
  /** When the page was last shown. */
  shownAt: number;
  /** Why the last session failed or ended, until a snapshot arrives. */
  reason: FeedDown | null;
}

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
/** True once the feed has greeted with the receiver, whether or not it knows its position. */
export const [receiverAnswered, setReceiverAnswered] = createSignal(false);
/** Bumped whenever the projection is (re)configured; projected geometry must be rebuilt. */
const [projectionVersionSignal, setProjectionVersion] = createSignal(0);
export const projectionVersion = projectionVersionSignal;
export const bumpProjection = (): void => {
  setProjectionVersion((v) => v + 1);
};
export const [feedStatus, setFeedStatus] = createSignal<FeedStatus>({
  lastAt: null,
  shownAt: Date.now(),
  reason: null,
});
/** Bumped on every snapshot; coarse-grained reactivity over the track store. */
const [snapshotVersionSignal, setSnapshotVersion] = createSignal(0);
export const snapshotVersion = snapshotVersionSignal;
export const bumpSnapshot = (): void => {
  setSnapshotVersion((v) => v + 1);
};
export const [selected, setSelected] = createSignal<string | null>(null);
/** Whether the filter reduces the target on the scope, which it never does to the selected one. */
export const isFiltered = (t: Filterable & { hex: string }): boolean =>
  visibility(t, selected(), settings.filter, settings.altimeter) === 'filtered';
/** Where each block was last drawn from its target, CSS px, mid-slide included: where the pointer finds it. */
export const drawnBlocks = new Map<string, { dx: number; dy: number }>();

export const [hovered, setHovered] = createSignal<string | null>(null);
/** Pan offset from the site, in NM. */
export const [pan, setPan] = createSignal<Vec2>({ x: 0, y: 0 });
export const [canvasSize, setCanvasSize] = createSignal({ width: 1, height: 1, dpr: 1 });
/** Where a hovering or dragging pointer is on the canvas; null when none is. */
export const [pointer, setPointer] = createSignal<{ cx: number; cy: number } | null>(null);
export const [rbls, setRbls] = createSignal<Rbl[]>([]);
export const [rblPending, setRblPending] = createSignal<RblPending | null>(null);
export const [rangeCursor, setRangeCursor] = createSignal<RangeCursorOrigin | null>(null);
const [panelsSignal, setPanels] = createSignal<Record<PanelId, boolean>>({ ...persisted.panels });
export const panels = panelsSignal;
export const [renderError, setRenderError] = createSignal<string | null>(null);

export function togglePanel(id: PanelId): void {
  setPanels((p) => ({ ...p, [id]: !p[id] }));
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
export const [aboutVisible, setAboutVisible] = createSignal(false);
/** RBL anchor prompt shown center-top; null when idle. */
export const [modeText, setModeText] = createSignal<string | null>(null);
/** One-hertz wall clock for the top bar and feed staleness. */
export const [tick, setTick] = createSignal(Date.now());
export const [coast, setCoast] = createSignal<CoastData>({ lines: [] });
