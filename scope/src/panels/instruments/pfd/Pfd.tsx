import { createMemo, createSignal, Show } from 'solid-js';

import { cx } from '../../../design/cx';
import type { Track } from '../../../state/track';
import { trackWidth } from '../../../ui/size';
import { isLost } from '../freshness';
import {
  altitudeStripPath,
  fmaBandPath,
  fmaRulesPath,
  pfdGeometry,
  speedStripPath,
} from './geometry';

import s from './Pfd.module.css';

/** The primary flight display of a target: its modes, speed, attitude, altitude and vertical speed. */
export function Pfd(props: { t: Track }) {
  const [root, setRoot] = createSignal<HTMLDivElement>();
  const width = trackWidth(root);
  const g = createMemo(() => pfdGeometry(width()));
  const lost = createMemo(() => isLost(props.t));
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
      </Show>
    </div>
  );
}
