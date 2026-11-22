import { createMemo } from 'solid-js';

import { clockTime } from '../lib/format';
import { currentNotice, messageRate, qnhReadout, trackCount } from '../state/barReadouts';
import { infoBlockLabel, infoLine, tapInfoBlock } from '../state/infoBlock';
import { tick } from '../state/scope';
import { setSettings, settings } from '../state/settings';

import s from './InfoBlock.module.css';

const clock = () => `${clockTime(tick() / 1000)}Z`;

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
  return (
    <button
      type="button"
      class={s.block}
      aria-label={infoBlockLabel(clock(), line())}
      aria-disabled={notice() !== null}
      onClick={() => setSettings('infoPage', tapInfoBlock(settings.infoPage, notice()))}
    >
      <span class={s.lines}>
        <span class={s.clock}>{clock()}</span>
        <span class={s.status}>
          <span class={s.lamp} data-tone={line().lamp ?? undefined} />
          <span class={s.text} data-tone={line().cls ?? undefined}>
            {line().label && `${line().label} `}
            <span class={s.v}>{line().value}</span>
            {line().unit && ` ${line().unit}`}
          </span>
        </span>
      </span>
    </button>
  );
}
