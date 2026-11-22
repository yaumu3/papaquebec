/** What both bars read: plain reactive reads, for the caller to memo. */

import { clockTime } from '../lib/format';
import { type Notice, feedNotice } from './feedLine';
import { qnhReport, qnhStation } from './qnh';
import { type QnhStatus, qnhStatus } from './qnhStatus';
import { feedStatus, snapshotVersion, tick } from './scope';
import { settings } from './settings';
import { trackStore } from './tracks';

export function qnhReadout(): QnhStatus {
  return qnhStatus({
    qnhInHg: settings.altimeter.qnhInHg,
    auto: settings.qnh.auto,
    station: qnhStation(),
    report: qnhReport(),
  });
}

/** The clock as both bars show it: the UTC time with its Z. */
export function clockReadout(): string {
  return `${clockTime(tick() / 1000)}Z`;
}

export function trackCount(): number {
  snapshotVersion();
  return trackStore.tracks.size;
}

export function messageRate(): number {
  snapshotVersion();
  return Math.round(trackStore.stats.messageRate);
}

export function currentNotice(): Notice | null {
  return feedNotice(feedStatus(), tick());
}
