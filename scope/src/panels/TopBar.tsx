import { Show } from 'solid-js';

import { cx } from '../design/cx';
import { feedNotice } from '../state/feedLine';
import { qnhError, qnhReport, qnhStation } from '../state/qnh';
import { type QnhStatus, qnhStatus } from '../state/qnhStatus';
import {
  aboutVisible,
  feedStatus,
  type PanelId,
  panels,
  renderError,
  renderInfo,
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

function qnh(): QnhStatus {
  return qnhStatus({
    qnhInHg: settings.altimeter.qnhInHg,
    auto: settings.qnh.auto,
    station: qnhStation(),
    report: qnhReport(),
    error: qnhError(),
    now: tick(),
  });
}

function trackCount(): number {
  snapshotVersion();
  return trackStore.tracks.size;
}

function messageRate(): number {
  snapshotVersion();
  return Math.round(trackStore.stats.messageRate);
}

/** Module class for a status tone. */
const tone = (cls: 'warn' | 'err' | null) =>
  cls === 'warn' ? s.warn : cls === 'err' ? s.err : undefined;

export function TopBar() {
  return (
    <div id="top-bar" class={s.bar}>
      <div class={s.clock}>{clock(tick())}</div>
      <div class={s.sep} />
      <div class={s.group}>
        <span class={s.item}>
          QNH <span class={cx(s.v, tone(qnh().cls))}>{qnh().value}</span>{' '}
          <span class={tone(qnh().cls)}>{qnh().source}</span>
        </span>
      </div>
      <div class={s.sep} />
      <Show
        when={feedNotice(feedStatus(), tick())}
        fallback={
          <div class={s.group}>
            <span class={s.item}>
              <span class={s.dot} />
              TRKS <span class={s.v}>{trackCount()}</span> ·{' '}
              <span class={s.v}>{messageRate()}</span> msg/s
            </span>
          </div>
        }
      >
        {(notice) => (
          <div class={s.group}>
            <span class={s.item}>
              <span class={cx(s.dot, tone(notice().cls))} />
              <span class={cx(s.v, tone(notice().cls))}>{notice().text}</span>
            </span>
          </div>
        )}
      </Show>
      <div class={cx(s.sep, s.desktopOnly)} />
      <div class={cx(s.group, s.desktopOnly)}>
        <Show when={renderError()} fallback={<span class={s.item}>{renderInfo()}</span>}>
          <span class={s.item}>
            <span class={cx(s.v, s.err)}>GPU · {renderError()}</span>
          </span>
        </Show>
      </div>
      <div class={s.spacer} />
      <div class={cx(s.group, s.desktopOnly)}>
        {PANELS.map(([id, label]) => (
          <Button on={panels()[id]} onClick={() => togglePanel(id)}>
            {label}
          </Button>
        ))}
        <Button
          class={s.about}
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
