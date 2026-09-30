import { createEffect, createMemo, createSignal, on, onCleanup, untrack } from 'solid-js';

import { buildAtlas } from '../render/atlas/build';
import { createRenderer, type RenderStatus } from '../render/facade';
import { LAYER_ORDER, type LayerName } from '../render/layers';
import type { AtlasInfo, Batch, View } from '../render/protocol';
import { buildHover } from '../render/scene/hover';
import { buildOverlays } from '../render/scene/overlays';
import { ringPaths } from '../render/scene/rings';
import { buildMap, buildRings, navaidsShownAt } from '../render/scene/static';
import { buildTargets } from '../render/scene/targets';
import {
  aero,
  canvasSize,
  coast,
  declination,
  hovered,
  labelDrag,
  pointer,
  rangeCursor,
  rblPending,
  rbls,
  projectionVersion,
  selected,
  site,
  setRenderError,
  setRenderInfo,
  snapshotVersion,
} from '../state/scope';
import { settings } from '../state/settings';
import { projectNm, trackStore, unprojectNm } from '../state/tracks';
import { RBL_SNAP_PX, targetAt } from './hit';
import { debounce } from './settle';
import { halfLongEdgeNm } from './view';

/** How long a zoom must rest before data blocks are laid out again at the new scale. */
const ZOOM_SETTLE_MS = 150;

type Layers = Partial<Record<LayerName, Batch[]>>;

/** Whether the site is known, so map data can be projected onto the scope. */
const projected = () => projectionVersion() > 0;

function reportStatus(s: RenderStatus): void {
  if (s.kind === 'ready') {
    setRenderInfo(`GPU ${s.where === 'worker' ? 'worker' : 'main thread'} · ${s.adapter}`);
    setRenderError(null);
  } else if (s.kind === 'error') {
    setRenderError(s.message);
  }
}

/**
 * The scale data blocks are laid out at. Pans leave it alone, and a zoom moves it only once it
 * settles; until then the blocks keep their corners, drawn at the live scale.
 */
function settledScale(view: () => View): () => number {
  const scale = createMemo(() => view().pxPerNm);
  const [settled, setSettled] = createSignal(untrack(scale));
  createEffect(on(scale, debounce(ZOOM_SETTLE_MS, setSettled), { defer: true }));
  return settled;
}

/**
 * Connects state to the renderer. Each layer is rebuilt when what its builder reads changes;
 * the only timer is the one that settles a zoom.
 */
export function mountScene(canvas: HTMLCanvasElement, view: () => View): void {
  const renderer = createRenderer(canvas, view(), reportStatus);
  onCleanup(() => renderer.destroy());
  createEffect(() => renderer.setView(view()));

  const [atlas, setAtlas] = createSignal<AtlasInfo | null>(null);
  void buildAtlas().then(({ info, pixels }) => {
    renderer.setAtlas(info, pixels);
    setAtlas(info);
  });

  /** Hands the renderer the layers `build` returns, again whenever what it reads changes. */
  const show = (build: (atlas: AtlasInfo) => Layers | null) =>
    createEffect(() => {
      const a = atlas();
      const layers = a && build(a);
      if (!layers) return;
      for (const name of LAYER_ORDER) {
        const batches = layers[name];
        if (batches) renderer.setLayer(name, batches);
      }
    });

  /** Ring outlines round the site, kept until the projection changes with it; none before either is set. */
  const ringPath = createMemo(() => {
    const s = site();
    return s ? ringPaths(s, projectNm) : null;
  });
  show((a) => {
    const path = ringPath();
    if (!path) return null;
    const { width, height } = canvasSize();
    return {
      rings: buildRings({
        layers: { ...settings.layers },
        rangeNm: settings.rangeNm,
        ringExtentNm: halfLongEdgeNm(width, height, settings.rangeNm),
        ringPath: path,
        atlas: a,
      }),
    };
  });

  /** Zooming reaches the map layers only when it shows or hides the navaids. */
  const navaidsInRange = createMemo(() => navaidsShownAt(settings.rangeNm));
  show((a) =>
    projected()
      ? buildMap({
          coast: coast(),
          aero: aero(),
          project: projectNm,
          layers: { ...settings.layers },
          labelDensity: settings.labelDensity,
          navaidsInRange: navaidsInRange(),
          atlas: a,
        })
      : null,
  );

  const layoutScale = settledScale(view);
  /** Bumped once blocks are placed, which moves targets and their blocks under the hover. */
  const [blocksPlaced, setBlocksPlaced] = createSignal(0);
  show((a) => {
    snapshotVersion();
    const { batches, corners } = buildTargets({
      tracks: trackStore.tracks.values(),
      now: trackStore.stats.now,
      filter: { ...settings.filter },
      vectorMin: settings.vectorMin,
      trailSec: settings.trailSec,
      selected: selected(),
      labelDrag: labelDrag(),
      altimeter: { ...settings.altimeter },
      pxPerNm: layoutScale(),
      atlas: a,
    });
    for (const [hex, corner] of corners) {
      const t = trackStore.tracks.get(hex);
      if (t) t.ops.autoCorner = corner;
    }
    setBlocksPlaced((n) => n + 1);
    return { targets: batches };
  });

  show(() => {
    blocksPlaced();
    const hex = hovered();
    return {
      hover: buildHover({
        track: hex ? (trackStore.tracks.get(hex) ?? null) : null,
        selected: selected(),
        filter: { ...settings.filter },
        altimeter: { ...settings.altimeter },
        labelDrag: labelDrag(),
      }),
    };
  });

  show((a) => {
    snapshotVersion();
    const v = view();
    const measuring = rblPending() !== null || rangeCursor() !== null;
    return {
      overlays: buildOverlays({
        tracks: trackStore.tracks,
        rbls: rbls(),
        rblPending: rblPending(),
        rangeCursor: rangeCursor(),
        pointer: measuring ? pointer() : null,
        declination: declination(),
        project: projectNm,
        unproject: unprojectNm,
        view: v,
        atlas: a,
        snap: (cx, cy) => targetAt(v, cx, cy, RBL_SNAP_PX),
      }),
    };
  });
}
