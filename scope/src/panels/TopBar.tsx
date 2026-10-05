import { createMemo, Show } from 'solid-js';

import { cx } from '../design/cx';
import { feedNotice, type Tone } from '../state/feedLine';
import { qnhError, qnhReport, qnhStation } from '../state/qnh';
import { qnhStatus } from '../state/qnhStatus';
import {
  aboutVisible,
  feedStatus,
  type PanelId,
  panels,
  renderError,
  setAboutVisible,
  snapshotVersion,
  tick,
  togglePanel,
} from '../state/scope';
import { settings } from '../state/settings';
import { trackStore } from '../state/tracks';
import { Button } from '../ui/Button';

import s from './TopBar.module.css';

const pad = (n: number) => String(n).padStart(2, '0');

function clock(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

const PANELS: [PanelId, string][] = [
  ['display', 'DISP'],
  ['maps', 'MAP'],
  ['list', 'LIST'],
  ['detail', 'DETAIL'],
];

function trackCount(): number {
  snapshotVersion();
  return trackStore.tracks.size;
}

function messageRate(): number {
  snapshotVersion();
  return Math.round(trackStore.stats.messageRate);
}

/** Module class of each status tone. */
const TONES: Record<Tone, string | undefined> = { warn: s.warn, err: s.err };
const tone = (cls: Tone | null | undefined) => cls && TONES[cls];

export function TopBar() {
  const qnh = createMemo(() =>
    qnhStatus({
      qnhInHg: settings.altimeter.qnhInHg,
      auto: settings.qnh.auto,
      station: qnhStation(),
      report: qnhReport(),
      error: qnhError(),
      now: tick(),
    }),
  );
  const notice = createMemo(() => feedNotice(feedStatus(), tick()));
  return (
    <div id="top-bar" class={s.bar}>
      <div class={s.clock}>{clock(tick())}</div>
      <div class={s.item}>
        QNH <span class={cx(s.v, tone(qnh().cls))}>{qnh().value}</span>
        <span class={cx(s.desktopOnly, tone(qnh().cls))}> {qnh().source}</span>
      </div>
      <div class={cx(s.item, s.feed)}>
        <span class={cx(s.lamp, tone(notice()?.cls))} />
        <span class={s.desktopOnly}>FEED </span>
        <Show
          when={notice()}
          fallback={
            <>
              <span class={s.v}>{trackCount()}</span> TRK
              <span class={s.desktopOnly}>
                {' · '}
                <span class={s.v}>{messageRate()}</span> msg/s
              </span>
            </>
          }
        >
          {(n) => <span class={cx(s.v, tone(n().cls))}>{n().text}</span>}
        </Show>
      </div>
      <Show when={renderError()}>
        <div class={cx(s.item, s.err, s.desktopOnly)}>GPU · {renderError()}</div>
      </Show>
      <div class={cx(s.buttons, s.desktopOnly)}>
        {PANELS.map(([id, label]) => (
          <Button class={s.btn} on={panels()[id]} onClick={() => togglePanel(id)}>
            {label}
          </Button>
        ))}
        <Button
          class={cx(s.btn, s.about)}
          on={aboutVisible()}
          label="About"
          onClick={() => setAboutVisible((v) => !v)}
        >
          i
        </Button>
      </div>
    </div>
  );
}
