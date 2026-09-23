import { createEffect, createSignal, on, onCleanup } from 'solid-js';

import { buildAtlas } from '../render/atlas/build';
import { createRenderer } from '../render/facade';
import type { AtlasInfo, View } from '../render/protocol';
import { buildOverlays } from '../render/scene/overlays';
import { buildStatic, STATIC_ORDER } from '../render/scene/static';
import { buildTargets } from '../render/scene/targets';
import {
  aero,
  coast,
  declination,
  hovered,
  labelDrag,
  mouse,
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
import { targetAt } from './hit';

const ORDER = [...STATIC_ORDER, 'targets', 'overlays'];

/**
 * Connects state to the renderer. Each effect rebuilds one layer when its
 * inputs change; nothing here runs on a timer.
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

  void buildAtlas().then(({ info, pixels }) => {
    renderer.setAtlas(info, pixels);
    setAtlas(info);
  });

  createEffect(() => {
    renderer.setView(view());
    renderer.draw(ORDER);
  });

  createEffect(() => {
    const a = atlas();
    if (!a || projectionVersion() === 0) return;
    const layers = buildStatic({
      coast: coast(),
      aero: aero(),
      project: projectNm,
      layers: { ...settings.layers },
      labelDensity: settings.labelDensity,
      rangeNm: settings.rangeNm,
      atlas: a,
    });
    for (const l of layers) renderer.setLayer(l.name, l.batches);
    renderer.draw(ORDER);
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
      hovered: hovered(),
      labelDrag: labelDrag(),
      altimeter: { ...settings.altimeter },
      trace: selectedTrace()?.hex === selected() ? (selectedTrace()?.fixes ?? null) : null,
      view: view(),
      atlas: a,
    });
    for (const [hex, corner] of corners) {
      const t = trackStore.tracks.get(hex);
      if (t) t.ops.autoCorner = corner;
    }
    renderer.setLayer('targets', batches);
    renderer.draw(ORDER);
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
        () => (rblPending() || rangeCursor() ? mouse() : null),
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
            mouse: mouse(),
            declination: declination(),
            view: v,
            atlas: a,
            snap: (cx, cy) => targetAt(v, cx, cy, 15),
          }),
        );
        renderer.draw(ORDER);
      },
    ),
  );
}
