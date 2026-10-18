import { Show } from 'solid-js';

import { cx } from '../../../design/cx';
import {
  apY,
  FMA_CENTRE_Y,
  fmaBandPath,
  fmaColumnX,
  fmaRulesPath,
  type PfdGeometry,
} from './geometry';
import type { PfdFma } from './readout';

import s from './Pfd.module.css';

/** The band of the annunciator and its rules. */
export function FmaMarks(props: { g: PfdGeometry }) {
  return (
    <>
      <path class={s.fma} d={fmaBandPath(props.g)} />
      <path class={s.rules} d={fmaRulesPath(props.g)} />
    </>
  );
}

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

/** The modes in their columns, and the autopilot above the attitude window. */
export function FmaText(props: { g: PfdGeometry; fma: PfdFma }) {
  return (
    <>
      <Mode text={props.fma.lateral} x={fmaColumnX(props.g)[1]} boxed={props.fma.boxed.lateral} />
      <Mode text={props.fma.vertical} x={fmaColumnX(props.g)[2]} boxed={props.fma.boxed.vertical} />
      <Show when={props.fma.ap}>
        <div class={s.ap} style={{ left: `${props.g.acx}px`, top: `${apY(props.g)}px` }}>
          AP
        </div>
      </Show>
    </>
  );
}
