import { createMemo, Show } from 'solid-js';

import { panelTip } from '../canvas/input/devices/keyboard';
import { cx } from '../design/cx';
import {
  clockReadout,
  currentNotice,
  messageRate,
  qnhReadout,
  trackCount,
} from '../state/barReadouts';
import {
  aboutVisible,
  type PanelId,
  panels,
  renderError,
  setAboutVisible,
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

export function TopBar() {
  const qnh = createMemo(qnhReadout);
  const notice = createMemo(currentNotice);
  return (
    <div id="top-bar" class={s.bar}>
      <div class={s.clock}>{clockReadout()}</div>
      <div class={s.item}>
        QNH{' '}
        <span class={s.v} data-tone={qnh().cls}>
          {qnh().value}
        </span>
        <span data-tone={qnh().cls}> {qnh().source}</span>
      </div>
      <div class={s.item}>
        <span class={s.lamp} data-tone={notice()?.cls} />
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
          {(n) => (
            <span class={s.v} data-tone={n().cls}>
              {n().text}
            </span>
          )}
        </Show>
      </div>
      <Show when={renderError()}>
        <div class={s.item} data-tone="err">
          GPU · {renderError()}
        </div>
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
