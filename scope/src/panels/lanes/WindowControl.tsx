import { createMemo, Show } from 'solid-js';

import { cx } from '../../design/cx';
import { formatAgo } from '../../lib/format';
import { hoverInstant, lanesView, setLanesWindow } from '../../state/lanes';
import { snapshotVersion } from '../../state/scope';
import type { Track } from '../../state/track';
import { trackStore } from '../../state/tracks';
import { contactOf, goLive, holdWindow, resolveWindow } from '../../state/window';
import { controlLabel } from './control';

import s from './WindowControl.module.css';

/**
 * The window's state and its switch: LIVE while the window follows now, with the lag while it is
 * held; while the cursor peeks, its age covers the button, which stays under it and keeps the focus.
 */
export function WindowControl(props: { track: Track }) {
  const hex = () => props.track.hex;
  // A memo, so that a resting pointer's readout goes on counting as the snapshots arrive.
  const now = createMemo(() => {
    snapshotVersion();
    return trackStore.stats.now;
  });
  const lanesWindow = createMemo(() => lanesView(hex()).window);
  const visible = () => resolveWindow(lanesWindow(), contactOf(props.track.samples, now()));
  const held = () => lanesWindow().kind === 'held';
  const lag = () => now() - visible().to;
  const toggle = () => setLanesWindow(hex(), held() ? goLive(visible()) : holdWindow(visible()));
  return (
    <span class={s.control}>
      <button
        type="button"
        class={cx(s.button, held() && s.held, hoverInstant() !== null && s.covered)}
        aria-label={controlLabel(lanesWindow(), lag())}
        onClick={toggle}
      >
        <span class={s.dot} aria-hidden="true" />
        LIVE
        <Show when={held()}>
          <span class={s.lag}>{formatAgo(lag())}</span>
        </Show>
      </button>
      <Show when={hoverInstant()}>
        {(t) => (
          <span class={s.peek} aria-hidden="true">
            {formatAgo(now() - t())}
          </span>
        )}
      </Show>
    </span>
  );
}
