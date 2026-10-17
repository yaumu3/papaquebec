import { For, Index, Show } from 'solid-js';

import { Flag } from './Flag';
import {
  type PfdGeometry,
  type SpeedDigits,
  type SpeedTape as SpeedTapeMarks,
  speedBoxPath,
  speedDigits,
  speedReadout,
  speedStripPath,
  speedTape,
} from './geometry';

import s from './Pfd.module.css';

/** The speed tape and its readout's digits, for a speed that holds. */
export interface SpeedView {
  tape: SpeedTapeMarks;
  digits: SpeedDigits;
}

export const speedView = (g: PfdGeometry, ias: number | undefined): SpeedView | undefined =>
  ias === undefined ? undefined : { tape: speedTape(g, ias), digits: speedDigits(ias) };

/** The strip, and while the speed holds its ticks and readout box. */
export function SpeedMarks(props: { g: PfdGeometry; view: SpeedView | undefined }) {
  return (
    <>
      <path class={s.strip} d={speedStripPath(props.g)} />
      <Show when={props.view}>
        {(v) => (
          <>
            <path class={s.ticks} d={v().tape.ticks} />
            <path class={s.readout} d={speedBoxPath(props.g)} />
          </>
        )}
      </Show>
    </>
  );
}

/** The labels, the readout's digits and the Mach, or the SPD flag. */
export function SpeedText(props: { g: PfdGeometry; view: SpeedView | undefined; mach: string }) {
  const at = () => speedReadout(props.g);
  return (
    <>
      <Show when={props.view} fallback={<Flag text="SPD" x={at().midX} y={props.g.yc} />}>
        {(v) => (
          <>
            <For each={v().tape.labels}>
              {(l) => (
                <div class={s.speedLabel} style={{ left: `${l.x}px`, top: `${l.y}px` }}>
                  {l.text}
                </div>
              )}
            </For>
            <div class={s.speed} style={{ left: `${at().hiX}px`, top: `${props.g.yc}px` }}>
              {v().digits.hi}
            </div>
            <div
              class={s.drum}
              style={{
                left: `${at().drum.x}px`,
                top: `${at().drum.y}px`,
                width: `${at().drum.w}px`,
                height: `${at().drum.h}px`,
              }}
            >
              <div class={s.digits} style={{ top: `${at().drumTop}px` }}>
                <Index each={v().digits.drum}>{(d) => <div>{d()}</div>}</Index>
              </div>
            </div>
          </>
        )}
      </Show>
      <div class={s.mach} style={{ left: `${at().midX}px`, top: `${props.g.footY}px` }}>
        {props.mach}
      </div>
    </>
  );
}
