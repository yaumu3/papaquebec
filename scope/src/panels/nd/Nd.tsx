import { createMemo, createSignal, For, Index, Show } from 'solid-js';

import { cx } from '../../design/cx';
import { ndRangeNm } from '../../state/nd';
import type { Track } from '../../state/track';
import { trackStore } from '../../state/tracks';
import { trackWidth } from '../../ui/size';
import {
  aircraftPath,
  arcPath,
  compass,
  lastHeardY,
  lubberPath,
  ndGeometry,
  rangeAnchors,
  ringPath,
} from './geometry';
import { ndFrame } from './readout';

import s from './Nd.module.css';

/** The navigation display of a target: its compass, oriented on the heading or else the track. */
export function Nd(props: { t: Track }) {
  const [root, setRoot] = createSignal<HTMLDivElement>();
  const width = trackWidth(root);
  const g = createMemo(() => ndGeometry(width()));
  const frame = createMemo(() => ndFrame(props.t, trackStore.stats.now));
  const marks = createMemo(() => compass(g(), frame().orient));
  const lastFrame = () => frame().mode === 'lost' || frame().mode === 'blank';
  const anchors = createMemo(() => rangeAnchors(g()));
  return (
    <div ref={setRoot} class={cx(s.nd, lastFrame() && s.last)} style={{ height: `${g().h}px` }}>
      <Show when={width() > 0}>
        <svg class={s.svg} aria-hidden="true">
          <path class={s.ring} d={ringPath(g())} />
          <path class={s.arc} d={arcPath(g(), g().r)} />
          <path class={s.minor} d={marks().minor} />
          <path class={s.major} d={marks().major} />
          <path class={s.lubber} d={lubberPath(g())} />
          <path class={s.aircraft} d={aircraftPath(g())} />
        </svg>
        <Index each={marks().labels}>
          {(l) => (
            <div
              class={cx(s.mark, l().big ? s.big : s.small)}
              style={{ left: `${l().x}px`, top: `${l().y}px` }}
            >
              {l().text}
            </div>
          )}
        </Index>
        <div
          class={s.range}
          style={{ left: `${anchors().outer.x}px`, top: `${anchors().outer.y}px` }}
        >
          {ndRangeNm()}
        </div>
        <div
          class={s.range}
          style={{ left: `${anchors().half.x}px`, top: `${anchors().half.y}px` }}
        >
          {ndRangeNm() / 2}
        </div>
        <div class={s.top}>
          <span class={cx(s.label, s.modeLabel)}>{frame().label}</span>
          <span class={s.box}>{frame().box}</span>
          <span class={s.label}>MAG</span>
        </div>
        <Show when={frame().lastHeard}>
          {(text) => (
            <div class={s.lastHeard} style={{ top: `${lastHeardY(g())}px` }}>
              {text()}
            </div>
          )}
        </Show>
        <div class={s.alerts}>
          <For each={frame().flags}>{(flag) => <span class={s.flag}>{flag}</span>}</For>
        </div>
      </Show>
    </div>
  );
}
