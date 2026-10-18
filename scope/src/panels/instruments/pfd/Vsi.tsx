import { Index, Show } from 'solid-js';

import {
  type PfdGeometry,
  vsiDigits,
  vsiNeedlePath,
  type VsiScale,
  vsiStripPath,
  type VsiDigits,
} from './geometry';

import s from './Pfd.module.css';

/** The needle and digits of a vertical rate that holds. */
export interface NeedleView {
  path: string;
  digits: VsiDigits | undefined;
}

/** The needle on the rate as shown, the digits on the rate as reported, while it holds. */
export const needleView = (
  g: PfdGeometry,
  shown: number | undefined,
  reported: number | undefined,
): NeedleView | undefined =>
  shown === undefined || reported === undefined
    ? undefined
    : { path: vsiNeedlePath(g, shown), digits: vsiDigits(g, reported) };

/** The strip and its scale, and the needle while the rate holds. */
export function VsiMarks(props: {
  g: PfdGeometry;
  scale: VsiScale;
  needle: NeedleView | undefined;
}) {
  return (
    <>
      <path class={s.strip} d={vsiStripPath(props.g)} />
      <path class={s.scale} d={props.scale.ticks} />
      <Show when={props.needle}>{(n) => <path class={s.needle} d={n().path} />}</Show>
    </>
  );
}

/** The scale's labels, and the rate's digits while it holds and is large. */
export function VsiText(props: { scale: VsiScale; needle: NeedleView | undefined }) {
  return (
    <>
      <Index each={props.scale.labels}>
        {(l) => (
          <div class={s.vsiLabel} style={{ left: `${l().x}px`, top: `${l().y}px` }}>
            {l().text}
          </div>
        )}
      </Index>
      <Show when={props.needle?.digits}>
        {(d) => (
          <div class={s.vsiDigits} style={{ left: `${d().x}px`, top: `${d().y}px` }}>
            {d().text}
          </div>
        )}
      </Show>
    </>
  );
}
