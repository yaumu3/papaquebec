import { createEffect, createMemo, createSignal, on, onCleanup, untrack } from 'solid-js';

import { buildAtlas } from '../render/atlas/build';
import { createRenderer } from '../render/facade';
import { MAP_LAYERS } from '../render/layers';
import type { AtlasInfo, View } from '../render/protocol';
import { buildHover } from '../render/scene/hover';
import { buildOverlays } from '../render/scene/overlays';
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
  selectedTrace,
  setRenderError,
  setRenderInfo,
  snapshotVersion,
} from '../state/scope';
import { settings } from '../state/settings';
import { projectNm, trackStore } from '../state/tracks';
import { RBL_SNAP_PX, targetAt } from './hit';
import { debounce } from './settle';
import { halfLongEdgeNm } from './view';

/** How long a zoom must rest before data blocks are laid out again at the new scale. */
const ZOOM_SETTLE_MS = 150;

/**
 * Connects state to the renderer. Each effect rebuilds one layer when its
 * inputs change; the only timer is the one that settles a zoom.
 */
export function mountScene(canvas: HTMLCanvasElement, view: () => View): void {
  const [atlas, setAtlas] = createSignal<AtlasInfo | null>(null);
  const renderer = createRenderer(canvas, view(), (s) => {
    if (s.kind === 'ready') {
      setRenderInfo(`GPU ${s.where === 'worker' ? 'worker' : 'main thread'} · ${s.adapter}`);
      setRenderError(null);
    } else if (s.kind === 'error') {
      setRenderError(s.message);
    }
  });
  onCleanup(() => renderer.destroy());
  /**
   * The scale data blocks are laid out at. Pans leave it alone, and a zoom moves it only once it
   * settles; until then the blocks keep their corners, drawn at the live scale.
   */
  const scale = createMemo(() => view().pxPerNm);
  const [layoutScale, setLayoutScale] = createSignal(untrack(scale));
  /** Bumped by each targets build, which moves targets and their blocks under the hover. */
  const [targetsBuilt, setTargetsBuilt] = createSignal(0);
  createEffect(on(scale, debounce(ZOOM_SETTLE_MS, setLayoutScale), { defer: true }));

  void buildAtlas().then(({ info, pixels }) => {
    renderer.setAtlas(info, pixels);
    setAtlas(info);
  });

  createEffect(() => {
    renderer.setView(view());
  });

  createEffect(() => {
    const a = atlas();
    if (!a || projectionVersion() === 0) return;
    const { width, height } = canvasSize();
    renderer.setLayer(
      'rings',
      buildRings({
        layers: { ...settings.layers },
        rangeNm: settings.rangeNm,
        ringExtentNm: halfLongEdgeNm(width, height, settings.rangeNm),
        atlas: a,
      }),
    );
  });

  /** Zooming reaches the map layers only when it shows or hides the navaids. */
  const navaidsInRange = createMemo(() => navaidsShownAt(settings.rangeNm));
  createEffect(() => {
    const a = atlas();
    if (!a || projectionVersion() === 0) return;
    const layers = buildMap({
      coast: coast(),
      aero: aero(),
      project: projectNm,
      layers: { ...settings.layers },
      labelDensity: settings.labelDensity,
      navaidsInRange: navaidsInRange(),
      atlas: a,
    });
    for (const name of MAP_LAYERS) renderer.setLayer(name, layers[name]);
  });

  createEffect(() => {
    const a = atlas();
    if (!a) return;
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
      trace: selectedTrace()?.hex === selected() ? (selectedTrace()?.fixes ?? null) : null,
      pxPerNm: layoutScale(),
      atlas: a,
    });
    for (const [hex, corner] of corners) {
      const t = trackStore.tracks.get(hex);
      if (t) t.ops.autoCorner = corner;
    }
    renderer.setLayer('targets', batches);
    setTargetsBuilt((n) => n + 1);
  });

  createEffect(() => {
    targetsBuilt();
    const hex = hovered();
    renderer.setLayer(
      'hover',
      buildHover({
        track: hex ? (trackStore.tracks.get(hex) ?? null) : null,
        selected: selected(),
        filter: { ...settings.filter },
        altimeter: { ...settings.altimeter },
        labelDrag: labelDrag(),
      }),
    );
  });

  createEffect(
    on(
      [
        atlas,
        rbls,
        rblPending,
        rangeCursor,
        snapshotVersion,
        view,
        declination,
        () => (rblPending() || rangeCursor() ? pointer() : null),
      ],
      () => {
        const a = atlas();
        if (!a) return;
        const v = view();
        renderer.setLayer(
          'overlays',
          buildOverlays({
            tracks: trackStore.tracks,
            rbls: rbls(),
            rblPending: rblPending(),
            rangeCursor: rangeCursor(),
            pointer: pointer(),
            declination: declination(),
            view: v,
            atlas: a,
            snap: (cx, cy) => targetAt(v, cx, cy, RBL_SNAP_PX),
          }),
        );
      },
    ),
  );
}
