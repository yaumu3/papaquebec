import { Show } from 'solid-js';

import { cx } from '../../design/cx';
import { formatAgo } from '../../lib/format';
import { cursorInstant } from '../../state/lanes';
import type { Track } from '../../state/track';
import { goLive, holdWindow } from '../../state/window';
import { controlLabel } from './control';
import { createWindowView } from './windowView';

import s from './WindowControl.module.css';

/**
 * The window's state and its switch: LIVE while the window follows now, with the lag while it is
 * held; while the cursor peeks, its age covers the button, which stays under it and keeps the focus.
 */
export function WindowControl(props: { track: Track }) {
  const { lanesWindow, visible, now, lag, setWindow } = createWindowView(() => props.track);
  const held = () => lanesWindow().kind === 'held';
  const toggle = () => setWindow(held() ? goLive(visible()) : holdWindow(visible()));
  return (
    <span class={s.control}>
      <button
        type="button"
        class={cx(s.button, held() && s.held, cursorInstant() !== null && s.covered)}
        aria-label={controlLabel(lanesWindow(), lag())}
        onClick={toggle}
      >
        <span class={s.dot} aria-hidden="true" />
        LIVE
        <Show when={held()}>
          <span class={s.lag}>{formatAgo(lag())}</span>
        </Show>
      </button>
      <Show when={cursorInstant()}>
        {(t) => (
          <span class={s.peek} aria-hidden="true">
            {formatAgo(now() - t())}
          </span>
        )}
      </Show>
    </span>
  );
}
