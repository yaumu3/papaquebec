import { createMemo, createSignal, For, Index, Show } from 'solid-js';

import { cx } from '../../../design/cx';
import { turn } from '../../../lib/geo';
import { ndRangeAfter, ndRangeNm, setNdRangeNm } from '../../../state/nd';
import { snapshotVersion } from '../../../state/scope';
import { settings } from '../../../state/settings';
import type { Track } from '../../../state/track';
import { trackStore } from '../../../state/tracks';
import { trackWidth } from '../../../ui/size';
import { glided, glidedPoints } from '../glide';
import {
  aircraftPath,
  arcPath,
  bugPath,
  compass,
  lastHeardY,
  levelOffPath,
  lubberPath,
  ndGeometry,
  rangeAnchors,
  ringPath,
  threatSquarePath,
  trackPath,
  trafficDiamondPath,
  trendPath,
  trendPoints,
  windArrowPath,
} from './geometry';
import { boxOf, ndFrame, type NdSymbols, type NdText, ndReadouts, ndSymbols } from './readout';
import { ndTraffic, symbolDrawn, type TrafficKind } from './traffic';

import flags from '../flag.module.css';
import s from './Nd.module.css';

/** The small dim name of a value. */
function Label(props: { children: string }) {
  return <span class={s.name}>{props.children}</span>;
}

/** A value of a corner: dim for the blank of an unknown, else in its own tone. */
function Value(props: { r: NdText; class?: string | undefined }) {
  return <span class={props.r.known ? props.class : s.unknown}>{props.r.text}</span>;
}

/** A button that steps the range of the ND a step of the scale, dimmed and inert at the end of it. */
function ZoomButton(props: { label: string; step: 1 | -1; glyph: string }) {
  const next = () => ndRangeAfter(ndRangeNm(), props.step);
  return (
    <button
      type="button"
      class={s.zoomButton}
      aria-label={props.label}
      disabled={next() === undefined}
      onClick={() => {
        const to = next();
        if (to !== undefined) setNdRangeNm(to);
      }}
    >
      {props.glyph}
    </button>
  );
}

/** The navigation display of a target: its compass, oriented on the track. */
export function Nd(props: { t: Track }) {
  const [root, setRoot] = createSignal<HTMLDivElement>();
  const width = trackWidth(root);
  const g = createMemo(() => ndGeometry(width()));
  const frame = createMemo(() => ndFrame(props.t, trackStore.stats.now));
  const readouts = createMemo(() => ndReadouts(props.t, trackStore.stats.now));
  /**
   * The glides stand at once on another target, and when the frame changes mode: a target heard
   * again, or whose track lapses or comes back, is shown where it is, not on its way
   * from where the last frame left it.
   */
  const key = () => `${props.t.hex}/${frame().mode}`;
  const orient = glided(() => frame().orient, { wrap: 360, key });
  const marks = createMemo(() => compass(g(), orient()));
  const lastFrame = () => frame().mode === 'lost' || frame().mode === 'blank';
  const anchors = createMemo(() => rangeAnchors(g()));
  const symbols = createMemo(() => ndSymbols(props.t, trackStore.stats.now, settings.altimeter));
  const bearing = (of: (own: NdSymbols) => number | undefined) =>
    glided(() => of(symbols()), { wrap: 360, key });
  const trackDeg = bearing((own) => own.track);
  const selDeg = bearing((own) => own.sel);
  const windFromDeg = bearing((own) => own.windFrom);
  const levelOffNm = glided(() => symbols().levelOffNm, { key });
  const turnRate = glided(() => symbols().trend?.rateDegS, { key });
  const trendGs = glided(() => symbols().trend?.gsKt, { key });
  const relative = (deg: number | undefined) =>
    deg === undefined ? undefined : turn(orient(), deg);
  const track = createMemo(() => {
    const rel = relative(trackDeg());
    return rel === undefined ? undefined : { rel, line: trackPath(g()) };
  });
  const levelOff = createMemo(() => {
    const at = track();
    const nm = levelOffNm();
    return at && nm !== undefined ? levelOffPath(g(), at.rel, nm, ndRangeNm()) : undefined;
  });
  const trend = createMemo(() => {
    const at = track();
    const rateDegS = turnRate();
    const gsKt = trendGs();
    return at && rateDegS !== undefined && gsKt !== undefined
      ? trendPath(trendPoints(g(), at.rel, { rateDegS, gsKt }, ndRangeNm()))
      : undefined;
  });
  const wind = createMemo(() => {
    const rel = relative(windFromDeg());
    return rel === undefined ? undefined : windArrowPath(rel);
  });
  const bug = createMemo(() => {
    const rel = relative(selDeg());
    return rel === undefined ? undefined : bugPath(g(), rel);
  });
  const traffic = createMemo(() => {
    snapshotVersion();
    return ndTraffic(props.t, trackStore.tracks.values(), trackStore.stats.now, {
      frame: frame(),
      rangeNm: ndRangeNm(),
      g: g(),
    });
  });
  /** Where each traffic lies from own ship as shown: on its way to where its latest report puts it. */
  const lying = glidedPoints(
    () => traffic().symbols,
    (symbol) => symbol.key,
    (symbol) => symbol.at,
    key,
  );
  /** The symbols as drawn: each at where it lies, with the compass as it is turned now. */
  const shown = createMemo(() =>
    traffic().symbols.flatMap((symbol) => {
      const at = lying().get(symbol.key) ?? symbol.at;
      const drawn = symbolDrawn(symbol, at, orient(), { g: g(), rangeNm: ndRangeNm() });
      return drawn ? [drawn] : [];
    }),
  );
  const shapes = (kind: TrafficKind) =>
    shown()
      .filter((symbol) => symbol.kind === kind)
      .map((symbol) =>
        kind === 'threat'
          ? threatSquarePath(symbol.x, symbol.y)
          : trafficDiamondPath(symbol.x, symbol.y),
      )
      .join('');
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
          <path class={s.trafficOther} d={shapes('other')} />
          <path class={s.trafficProximate} d={shapes('proximate')} />
          <path class={s.threat} d={shapes('threat')} />
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
        <Index each={shown()}>
          {(symbol) => (
            <>
              <Show when={symbol().label}>
                {(label) => (
                  <div
                    class={cx(s.trafficLabel, symbol().kind === 'threat' && s.threatInk)}
                    style={{ left: `${label().x}px`, top: `${label().y}px` }}
                  >
                    {label().text}
                  </div>
                )}
              </Show>
              <Show when={symbol().arrow}>
                {(arrow) => (
                  <div
                    class={cx(s.trafficArrow, symbol().kind === 'threat' && s.threatInk)}
                    style={{ left: `${arrow().x}px`, top: `${arrow().y}px` }}
                  >
                    {arrow().glyph}
                  </div>
                )}
              </Show>
            </>
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
          <span class={cx(s.label, s.modeLabel)}>TRK</span>
          <span class={s.box}>{boxOf(frame().mode, orient())}</span>
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
          <Show when={traffic().offscale}>
            <span class={s.alert}>OFFSCALE</span>
          </Show>
          <Show when={traffic().traffic}>
            <span class={s.alert}>TRAFFIC</span>
          </Show>
          <For each={frame().flags}>{(flag) => <span class={flags.flag}>{flag}</span>}</For>
        </div>
        <div class={s.zoom}>
          <ZoomButton label="Zoom in" step={-1} glyph="+" />
          <ZoomButton label="Zoom out" step={1} glyph={'−'} />
        </div>
      </Show>
    </div>
  );
}
