import { createMemo, createSignal, Show } from 'solid-js';

import { cx } from '../../../design/cx';
import type { Track } from '../../../state/track';
import { trackStore } from '../../../state/tracks';
import { trackWidth } from '../../../ui/size';
import { isLost } from '../freshness';
import {
  altitudeStripPath,
  apY,
  FMA_CENTRE_Y,
  fmaBandPath,
  fmaColumnX,
  fmaRulesPath,
  pfdGeometry,
  speedStripPath,
} from './geometry';
import { pfdFma } from './readout';

import s from './Pfd.module.css';

/** The text of a column of the annunciator, centred on `x`; nothing for an empty column. */
function Mode(props: { text: string | undefined; x: number }) {
  return (
    <Show when={props.text}>
      {(text) => (
        <div class={s.mode} style={{ left: `${props.x}px`, top: `${FMA_CENTRE_Y}px` }}>
          {text()}
        </div>
      )}
    </Show>
  );
}

/** The primary flight display of a target: its modes, speed, attitude, altitude and vertical speed. */
export function Pfd(props: { t: Track }) {
  const [root, setRoot] = createSignal<HTMLDivElement>();
  const width = trackWidth(root);
  const g = createMemo(() => pfdGeometry(width()));
  const lost = createMemo(() => isLost(props.t));
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
          <rect
            class={s.window}
            x={g().wx}
            y={g().wy}
            width={g().wxr - g().wx}
            height={g().wyb - g().wy}
            rx="12"
          />
          <path class={s.fma} d={fmaBandPath(g())} />
          <path class={s.rules} d={fmaRulesPath(g())} />
        </svg>
        <Mode text={fma().lateral} x={fmaColumnX(g())[1]} />
        <Mode text={fma().vertical} x={fmaColumnX(g())[2]} />
        <Show when={fma().ap}>
          <div class={s.ap} style={{ left: `${g().acx}px`, top: `${apY(g())}px` }}>
            AP
          </div>
        </Show>
      </Show>
    </div>
  );
}
