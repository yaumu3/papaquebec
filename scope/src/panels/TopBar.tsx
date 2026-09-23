import { Show } from 'solid-js';

import { cx } from '../design/cx';
import { feedNotice } from '../state/feedLine';
import { qnhError, qnhReport, qnhStation } from '../state/qnh';
import { qnhStatus } from '../state/qnhStatus';
import {
  feedStatus,
  type PanelId,
  panels,
  renderError,
  renderInfo,
  snapshotVersion,
  tick,
  togglePanel,
} from '../state/scope';
import { settings } from '../state/settings';
import { trackStore } from '../state/tracks';

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

function qnh(): { cls: string; text: string } {
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
const tone = (cls: string) =>
  cls === 'good' ? s.good : cls === 'warn' ? s.warn : cls === 'err' ? s.err : undefined;

export function TopBar() {
  return (
    <div id="top-bar" class={s.bar}>
      <div class={s.clock}>{clock(tick())}</div>
      <div class={s.sep} />
      <div class={s.group}>
        <span class={s.item}>
          <span class={cx(s.v, tone(qnh().cls))}>{qnh().text}</span>
        </span>
      </div>
      <div class={s.sep} />
      <Show
        when={feedNotice(feedStatus(), tick())}
        fallback={
          <div class={s.group}>
            <span class={s.item}>
              <span class={cx(s.dot, s.good)} />
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
          <button
            type="button"
            class={cx(s.btn, panels()[id] && s.on)}
            onClick={() => togglePanel(id)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
