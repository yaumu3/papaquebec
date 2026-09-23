import type { MetarQnh } from '../lib/metar';

/** METARs come half-hourly or hourly; older than this and the setting is suspect. */
const QNH_STALE_MS = 2 * 3600_000;

export interface QnhStatusInput {
  qnhInHg: number;
  auto: boolean;
  station: string;
  report: MetarQnh | null;
  error: string | null;
  now: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const zulu = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}Z`;
};

/** Top-bar readout of the altimeter setting and where it came from. */
export function qnhStatus(s: QnhStatusInput): { text: string; cls: string } {
  const value = `QNH ${s.qnhInHg.toFixed(2)}`;
  if (!s.auto) return { text: `${value} MAN`, cls: '' };
  if (s.error) return { text: `${value} ${s.station} ERR`, cls: 'err' };
  if (!s.report) return { text: `${value}${s.station && ` ${s.station}`} ····`, cls: 'warn' };
  const stale = s.now - s.report.observedAt > QNH_STALE_MS;
  return {
    text: `${value} ${s.station} ${zulu(s.report.observedAt)}`,
    cls: stale ? 'warn' : 'good',
  };
}
