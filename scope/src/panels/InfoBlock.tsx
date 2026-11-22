import { createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js';

import { cx } from '../design/cx';
import { clockTime } from '../lib/format';
import { currentNotice, messageRate, qnhReadout, trackCount } from '../state/barReadouts';
import {
  infoBlockLabel,
  type InfoLine,
  infoLine,
  type Roll,
  rolled,
  tapInfoBlock,
} from '../state/infoBlock';
import { tick } from '../state/scope';
import { setSettings, settings } from '../state/settings';
import { INFO_PAGES } from '../state/settingsDefaults';
import { createHold } from '../ui/hold';

import s from './InfoBlock.module.css';

/** How long the indicator shows after the page loads, and after a switch. */
const LOAD_MS = 1500;
const SWITCH_MS = 1000;

const clock = () => `${clockTime(tick() / 1000)}Z`;

/** One line's text, its value in its tone. */
function Line(props: {
  line: InfoLine;
  class?: string | undefined;
  leaving?: (() => void) | undefined;
}) {
  return (
    <span
      class={cx(s.line, props.class)}
      data-tone={props.line.cls ?? undefined}
      aria-hidden={props.leaving ? true : undefined}
      onAnimationEnd={props.leaving}
    >
      {props.line.label && `${props.line.label} `}
      <span class={s.v}>{props.line.value}</span>
      {props.line.unit && ` ${props.line.unit}`}
    </span>
  );
}

/** The nav bar's centre: the clock over one status page, which a tap advances. */
export function InfoBlock() {
  const notice = createMemo(currentNotice);
  const line = createMemo(() =>
    infoLine(
      settings.infoPage,
      { qnh: qnhReadout(), tracks: trackCount(), rate: messageRate() },
      notice(),
    ),
  );
  const light = createHold();
  onMount(() => light.hold(LOAD_MS));
  onCleanup(light.drop);
  const tap = () => {
    const next = tapInfoBlock(settings.infoPage, notice());
    if (next === settings.infoPage) return;
    setSettings('infoPage', next);
    light.hold(SWITCH_MS);
  };
  const roll = createMemo<Roll>((prev) => rolled(prev, line()));
  const [gone, setGone] = createSignal<InfoLine | null>(null);
  const leaving = () => (roll().was === gone() ? null : roll().was);
  return (
    <button
      type="button"
      class={s.block}
      aria-label={infoBlockLabel(clock(), line())}
      aria-disabled={notice() !== null}
      onClick={tap}
    >
      <span class={s.lines}>
        <span class={s.clock}>{clock()}</span>
        <span class={s.status}>
          <span class={s.lamp} data-tone={line().lamp ?? undefined} />
          <span class={s.text}>
            <Show when={roll().now.key} keyed>
              {(_key) => {
                const enters = roll().was !== null;
                return <Line line={roll().now} class={enters ? s.enter : undefined} />;
              }}
            </Show>
            <Show when={leaving()} keyed>
              {(was) => <Line line={was} class={s.leave} leaving={() => setGone(was)} />}
            </Show>
          </span>
        </span>
      </span>
      <span class={cx(s.indicator, light.lit() && !notice() && s.lit)} aria-hidden="true">
        {INFO_PAGES.map((page) => (
          <span class={cx(s.mark, page === settings.infoPage && s.current)} />
        ))}
      </span>
    </button>
  );
}
