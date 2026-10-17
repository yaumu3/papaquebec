import { createMemo, createSignal, createUniqueId, For, Index, Show } from 'solid-js';

import { cx } from '../../../design/cx';
import type { Track } from '../../../state/track';
import { trackStore } from '../../../state/tracks';
import { trackWidth } from '../../../ui/size';
import { isLost } from '../freshness';
import {
  altitudeStripPath,
  apY,
  attitude,
  bankIndexPath,
  bankScalePath,
  FMA_CENTRE_Y,
  fmaBandPath,
  fmaColumnX,
  fmaRulesPath,
  pfdGeometry,
  speedBoxPath,
  speedDigits,
  speedReadout,
  speedStripPath,
  speedTape,
  windowRect,
} from './geometry';
import { pfdFma, pfdReadouts } from './readout';

import flags from '../flag.module.css';
import s from './Pfd.module.css';

/** The text of a column of the annunciator, centred on `x`; nothing for an empty column. */
function Mode(props: { text: string | undefined; x: number; boxed: boolean }) {
  return (
    <Show when={props.text}>
      {(text) => (
        <div
          class={cx(s.mode, props.boxed && s.boxed)}
          style={{ left: `${props.x}px`, top: `${FMA_CENTRE_Y}px` }}
        >
          {text()}
        </div>
      )}
    </Show>
  );
}

/** The flag of a value that does not hold, centred on (x, y). */
function Flag(props: { text: string; x: number; y: number }) {
  return (
    <span class={cx(flags.flag, s.flag)} style={{ left: `${props.x}px`, top: `${props.y}px` }}>
      {props.text}
    </span>
  );
}

/** The primary flight display of a target: its modes, speed, attitude, altitude and vertical speed. */
export function Pfd(props: { t: Track }) {
  const [root, setRoot] = createSignal<HTMLDivElement>();
  const width = trackWidth(root);
  const g = createMemo(() => pfdGeometry(width()));
  const lost = createMemo(() => isLost(props.t));
  const readouts = createMemo(() => pfdReadouts(props.t, trackStore.stats.now));
  const speed = createMemo(() => {
    const ias = readouts().ias;
    return ias === undefined ? undefined : { tape: speedTape(g(), ias), digits: speedDigits(ias) };
  });
  const speedAt = createMemo(() => speedReadout(g()));
  const windowClip = createUniqueId();
  const attitudeNow = createMemo(() => {
    const roll = readouts().roll;
    return roll === undefined ? undefined : { roll, ...attitude(g(), roll) };
  });
  const fma = createMemo(() => pfdFma(props.t, trackStore.stats.now));
  return (
    <div
      data-pfd
      ref={setRoot}
      class={cx(s.pfd, lost() && s.last)}
      style={{ height: `${g().h}px` }}
    >
      <Show when={width() > 0}>
        <svg class={s.svg} aria-hidden="true">
          <path class={s.strip} d={speedStripPath(g())} />
          <path class={s.strip} d={altitudeStripPath(g())} />
          <defs>
            <clipPath id={windowClip}>
              <rect {...windowRect(g())} />
            </clipPath>
          </defs>
          <rect class={s.window} {...windowRect(g())} />
          <Show when={attitudeNow()}>
            {(a) => (
              <g clip-path={`url(#${windowClip})`}>
                <path class={s.sky} d={a().sky} />
                <path class={s.ground} d={a().ground} />
                <path class={s.ladder} d={a().ladder} />
                <path class={s.horizon} d={a().horizon} />
                <path class={s.bank} d={bankScalePath(g())} />
                <path class={s.index} d={bankIndexPath(g())} />
                <path class={s.pointer} d={a().pointer} />
              </g>
            )}
          </Show>
          <Show when={speed()}>
            {(v) => (
              <>
                <path class={s.ticks} d={v().tape.ticks} />
                <path class={s.readout} d={speedBoxPath(g())} />
              </>
            )}
          </Show>
          <path class={s.fma} d={fmaBandPath(g())} />
          <path class={s.rules} d={fmaRulesPath(g())} />
        </svg>
        <Show when={attitudeNow()} fallback={<Flag text="ATT" x={g().acx} y={g().yc} />}>
          {(a) => (
            <Index each={a().labels}>
              {(l) => (
                <div
                  class={s.rungLabel}
                  style={{
                    left: `${l().x}px`,
                    top: `${l().y}px`,
                    transform: `translate(-50%, -50%) rotate(${-a().roll}deg)`,
                  }}
                >
                  {l().text}
                </div>
              )}
            </Index>
          )}
        </Show>
        <Show when={speed()}>
          {(v) => (
            <>
              <For each={v().tape.labels}>
                {(l) => (
                  <div class={s.speedLabel} style={{ left: `${l.x}px`, top: `${l.y}px` }}>
                    {l.text}
                  </div>
                )}
              </For>
              <div class={s.speed} style={{ left: `${speedAt().hiX}px`, top: `${g().yc}px` }}>
                {v().digits.hi}
              </div>
              <div
                class={s.drum}
                style={{
                  left: `${speedAt().drum.x}px`,
                  top: `${speedAt().drum.y}px`,
                  width: `${speedAt().drum.w}px`,
                  height: `${speedAt().drum.h}px`,
                }}
              >
                <div class={s.digits} style={{ top: `${speedAt().drumTop}px` }}>
                  <Index each={v().digits.drum}>{(d) => <div>{d()}</div>}</Index>
                </div>
              </div>
            </>
          )}
        </Show>
        <Show when={speed() === undefined}>
          <Flag text="SPD" x={speedAt().midX} y={g().yc} />
        </Show>
        <div class={s.mach} style={{ left: `${speedAt().midX}px`, top: `${g().footY}px` }}>
          {readouts().mach}
        </div>
        <Mode text={fma().lateral} x={fmaColumnX(g())[1]} boxed={fma().boxed.lateral} />
        <Mode text={fma().vertical} x={fmaColumnX(g())[2]} boxed={fma().boxed.vertical} />
        <Show when={fma().ap}>
          <div class={s.ap} style={{ left: `${g().acx}px`, top: `${apY(g())}px` }}>
            AP
          </div>
        </Show>
      </Show>
    </div>
  );
}
