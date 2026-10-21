import { createEffect, createMemo, on, Show } from 'solid-js';

import { cx } from '../design/cx';
import { advisoryWord } from '../lib/acas';
import { type EmergencyCode, type Priority, statusTags, wakeLetter } from '../lib/format';
import { trackLabel } from '../render/scene/rules';
import { keepViewOf, showsHistory } from '../state/lanes';
import { selected, snapshotVersion } from '../state/scope';
import type { Track } from '../state/track';
import { trackStore } from '../state/tracks';
import { Window } from '../ui/Window';
import { Lanes } from './lanes/Lanes';
import { WindowControl } from './lanes/WindowControl';

import s from './DetailPanel.module.css';

/** The word the header tags each priority with. */
const PRIORITY_WORDS: Record<Priority, string> = { lifeguard: 'LIFEGUARD', minfuel: 'MIN FUEL' };

/** The squawk, or the emergency code it is with its shorthand. */
function Squawk(props: { squawk: string | undefined; code: EmergencyCode | null }) {
  return (
    <Show when={props.squawk}>
      {(squawk) => (
        <Show when={props.code} fallback={<span class={cx(s.text, s.squawk)}>{squawk()}</span>}>
          {(code) => <span class={cx(s.text, s.code)}>{`${squawk()} ${code()}`}</span>}
        </Show>
      )}
    </Show>
  );
}

/**
 * Who it is: the flight on the first line, the airframe on the second. An active advisory ends the
 * first line, or stands alone at the right of the next when the tags leave it no room.
 */
function Header(props: { t: Track }) {
  const tags = createMemo(() => statusTags(props.t.squawk, props.t.emergency));
  const ra = () => (props.t.ra?.terminated ? undefined : props.t.ra);
  const type = () => props.t.type && `${props.t.type}/${wakeLetter(props.t.category)}`;
  const about = () => [props.t.description, props.t.category].filter(Boolean).join(' · ');
  return (
    <div class={s.head}>
      <div class={s.flight}>
        <span class={cx(s.text, s.callsign)}>{trackLabel(props.t)}</span>
        <Squawk squawk={props.t.squawk} code={tags().code} />
        <Show when={props.t.ident}>
          <span class={s.tag}>ID</span>
        </Show>
        <Show when={tags().status}>{(status) => <span class={s.emergency}>{status()}</span>}</Show>
        <Show when={tags().priority}>
          {(priority) => <span class={s.priority}>{PRIORITY_WORDS[priority()]}</span>}
        </Show>
        <Show when={ra()}>
          {(r) => <span class={cx(s.emergency, s.ra)}>RA {advisoryWord(r())}</span>}
        </Show>
      </div>
      <div class={cx(s.text, s.airframe)}>
        <Show when={type()}>
          <span title={about() || undefined}>{type()}</span>
        </Show>
        <Show when={props.t.registration}>
          <span>{props.t.registration}</span>
        </Show>
        <span>{props.t.hex.toUpperCase()}</span>
        <span class={s.slot}>
          <Show when={showsHistory()}>
            <WindowControl track={props.t} />
          </Show>
        </span>
      </div>
    </div>
  );
}

export function DetailPanel() {
  const track = createMemo(() => {
    snapshotVersion();
    const hex = selected();
    return hex ? (trackStore.tracks.get(hex) ?? null) : null;
  });
  createEffect(on(createMemo(selected), keepViewOf));
  return (
    <Window id="detail" bodyClass={s.body}>
      <Show
        when={track()}
        fallback={<div class={s.empty}>{selected() ? 'NOT IN FEED' : 'NO TARGET SELECTED'}</div>}
      >
        {(t) => (
          <>
            <Header t={t()} />
            <Lanes track={t()} />
          </>
        )}
      </Show>
    </Window>
  );
}
