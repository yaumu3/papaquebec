import { createMemo, Show } from 'solid-js';

import { panelTip } from '../canvas/input/devices/keyboard';
import { cx } from '../design/cx';
import { clockTime } from '../lib/format';
import { currentNotice, messageRate, qnhReadout, trackCount } from '../state/barReadouts';
import type { Tone } from '../state/feedLine';
import {
  aboutVisible,
  type PanelId,
  panels,
  renderError,
  setAboutVisible,
  tick,
  togglePanel,
} from '../state/scope';
import { PANEL_IDS } from '../state/settingsDefaults';
import { Button } from '../ui/Button';

import s from './TopBar.module.css';

const LABELS: Record<PanelId, string> = {
  display: 'DISP',
  maps: 'MAP',
  list: 'LIST',
  detail: 'DETAIL',
};

/** Module class of each status tone. */
const TONES: Record<Tone, string | undefined> = { warn: s.warn, err: s.err };
const tone = (cls: Tone | null | undefined) => cls && TONES[cls];

export function TopBar() {
  const qnh = createMemo(qnhReadout);
  const notice = createMemo(currentNotice);
  return (
    <div id="top-bar" class={s.bar}>
      <div class={s.clock}>{clockTime(tick() / 1000)}Z</div>
      <div class={s.item}>
        QNH <span class={cx(s.v, tone(qnh().cls))}>{qnh().value}</span>
        <span class={cx(tone(qnh().cls))}> {qnh().source}</span>
      </div>
      <div class={s.item}>
        <span class={cx(s.lamp, tone(notice()?.cls))} />
        {'FEED '}
        <Show
          when={notice()}
          fallback={
            <>
              <span class={s.v}>{trackCount()}</span> TRK
              {' · '}
              <span class={s.v}>{messageRate()}</span> msg/s
            </>
          }
        >
          {(n) => <span class={cx(s.v, tone(n().cls))}>{n().text}</span>}
        </Show>
      </div>
      <Show when={renderError()}>
        <div class={cx(s.item, s.err)}>GPU · {renderError()}</div>
      </Show>
      <div class={s.buttons}>
        {PANEL_IDS.map((id) => (
          <Button
            class={s.btn}
            on={panels()[id]}
            tip={panelTip(id)}
            onClick={() => togglePanel(id)}
          >
            {LABELS[id]}
          </Button>
        ))}
        <Button
          class={cx(s.btn, s.about)}
          on={aboutVisible()}
          label="About"
          tip="ABOUT · I"
          onClick={() => setAboutVisible((v) => !v)}
        >
          i
        </Button>
      </div>
    </div>
  );
}
