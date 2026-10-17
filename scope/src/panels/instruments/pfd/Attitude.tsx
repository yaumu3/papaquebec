import { createUniqueId, Index, Show } from 'solid-js';

import { Flag } from './Flag';
import {
  type Attitude as AttitudeMarks,
  attitude,
  bankIndexPath,
  bankScalePath,
  fpvAt,
  fpvPath,
  type PfdGeometry,
  windowRect,
} from './geometry';
import type { PfdReadouts } from './readout';

import s from './Pfd.module.css';

/** The sky, ground, ladder and bank scale for a roll that holds, with the flight path vector. */
export interface AttitudeView extends AttitudeMarks {
  roll: number;
  fpv: string | undefined;
}

export function attitudeView(g: PfdGeometry, r: PfdReadouts): AttitudeView | undefined {
  if (r.roll === undefined) return undefined;
  const fpv = r.fpv && fpvPath(fpvAt(g, r.roll, r.fpv));
  return { roll: r.roll, fpv, ...attitude(g, r.roll) };
}

/** The window, and while the roll holds the attitude drawn inside it. */
export function AttitudeMarks(props: { g: PfdGeometry; view: AttitudeView | undefined }) {
  const clip = createUniqueId();
  return (
    <>
      <defs>
        <clipPath id={clip}>
          <rect {...windowRect(props.g)} />
        </clipPath>
      </defs>
      <rect class={s.window} {...windowRect(props.g)} />
      <Show when={props.view}>
        {(a) => (
          <g clip-path={`url(#${clip})`}>
            <path class={s.sky} d={a().sky} />
            <path class={s.ground} d={a().ground} />
            <path class={s.ladder} d={a().ladder} />
            <path class={s.horizon} d={a().horizon} />
            <path class={s.bank} d={bankScalePath(props.g)} />
            <path class={s.index} d={bankIndexPath(props.g)} />
            <path class={s.pointer} d={a().pointer} />
            <Show when={a().fpv}>
              {(d) => (
                <>
                  <path class={s.fpvHalo} d={d()} />
                  <path class={s.fpv} d={d()} />
                </>
              )}
            </Show>
          </g>
        )}
      </Show>
    </>
  );
}

/** The ladder's numbers, turned with the roll, or the ATT flag. */
export function AttitudeText(props: { g: PfdGeometry; view: AttitudeView | undefined }) {
  return (
    <Show when={props.view} fallback={<Flag text="ATT" x={props.g.acx} y={props.g.yc} />}>
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
  );
}
