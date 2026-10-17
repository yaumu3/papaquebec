import { createMemo, createSignal, For, Index, Show } from 'solid-js';

import { cx } from '../../design/cx';
import { turn } from '../../lib/geo';
import { ndRangeNm } from '../../state/nd';
import { settings } from '../../state/settings';
import type { Track } from '../../state/track';
import { trackStore } from '../../state/tracks';
import { trackWidth } from '../../ui/size';
import {
  aircraftPath,
  arcPath,
  bugPath,
  compass,
  diamondPath,
  lastHeardY,
  levelOffPath,
  lubberPath,
  ndGeometry,
  rangeAnchors,
  ringPath,
  trackPath,
  trendPath,
  trendPoints,
  windArrowPath,
} from './geometry';
import { ndFrame, type NdText, ndReadouts, ndSymbols } from './readout';

import s from './Nd.module.css';

/** The small dim name of a value. */
function Label(props: { children: string }) {
  return <span class={s.name}>{props.children}</span>;
}

/** A value of a corner: dim for the blank of an unknown, else in its own tone. */
function Value(props: { r: NdText; class?: string | undefined }) {
  return <span class={props.r.known ? props.class : s.unknown}>{props.r.text}</span>;
}

/** The navigation display of a target: its compass, oriented on the heading or else the track. */
export function Nd(props: { t: Track }) {
  const [root, setRoot] = createSignal<HTMLDivElement>();
  const width = trackWidth(root);
  const g = createMemo(() => ndGeometry(width()));
  const frame = createMemo(() => ndFrame(props.t, trackStore.stats.now));
  const readouts = createMemo(() => ndReadouts(props.t, trackStore.stats.now));
  const marks = createMemo(() => compass(g(), frame().orient));
  const lastFrame = () => frame().mode === 'lost' || frame().mode === 'blank';
  const anchors = createMemo(() => rangeAnchors(g()));
  const symbols = createMemo(() => ndSymbols(props.t, trackStore.stats.now, settings.altimeter));
  const relative = (deg: number | undefined) =>
    deg === undefined ? undefined : turn(frame().orient, deg);
  const track = createMemo(() => {
    const rel = relative(symbols().track);
    return rel === undefined
      ? undefined
      : { rel, line: trackPath(g(), rel), diamond: diamondPath(g(), rel) };
  });
  const levelOff = createMemo(() => {
    const at = track();
    const nm = symbols().levelOffNm;
    return at && nm !== undefined ? levelOffPath(g(), at.rel, nm, ndRangeNm()) : undefined;
  });
  const trend = createMemo(() => {
    const at = track();
    const turning = symbols().trend;
    return at && turning ? trendPath(trendPoints(g(), at.rel, turning, ndRangeNm())) : undefined;
  });
  const wind = createMemo(() => {
    const rel = relative(symbols().windFrom);
    return rel === undefined ? undefined : windArrowPath(rel);
  });
  const bug = createMemo(() => {
    const rel = relative(symbols().sel);
    return rel === undefined ? undefined : bugPath(g(), rel);
  });
  return (
    <div
      data-nd
      ref={setRoot}
      class={cx(s.nd, lastFrame() && s.last)}
      style={{ height: `${g().h}px` }}
    >
      <Show when={width() > 0}>
        <svg class={s.svg} aria-hidden="true">
          <path class={s.ring} d={ringPath(g())} />
          <path class={s.arc} d={arcPath(g(), g().r)} />
          <path class={s.minor} d={marks().minor} />
          <path class={s.major} d={marks().major} />
          <path class={s.lubber} d={lubberPath(g())} />
          <Show when={track()}>{(p) => <path class={s.trackLine} d={p().line} />}</Show>
          <Show when={levelOff()}>{(d) => <path class={s.levelOff} d={d()} />}</Show>
          <Show when={trend()}>{(d) => <path class={s.trend} d={d()} />}</Show>
          <Show when={bug()}>{(d) => <path class={s.bug} d={d()} />}</Show>
          <Show when={track()}>{(p) => <path class={s.diamond} d={p().diamond} />}</Show>
          <path class={s.aircraft} d={aircraftPath(g())} />
          <Show when={wind()}>{(d) => <path class={s.wind} d={d()} />}</Show>
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
        <div class={cx(s.corner, s.topLeft)}>
          <div>
            <Label>GS </Label>
            <Value r={readouts().gs} class={s.strong} />
            <Label>{'  TAS '}</Label>
            <Value r={readouts().tas} />
          </div>
          <Value r={readouts().wind} />
        </div>
        <div class={cx(s.corner, s.topRight)}>
          <div>
            <Label>SEL </Label>
            <Value r={readouts().sel} class={s.sel} />
          </div>
          <div>
            <Label>TRK </Label>
            <Value r={readouts().trk} class={s.trk} />
          </div>
        </div>
        <div class={cx(s.corner, s.temps)}>
          <Label>TAT</Label>
          <Value r={readouts().tat} />
          <Label>SAT</Label>
          <Value r={readouts().sat} />
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
