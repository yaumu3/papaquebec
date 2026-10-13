import type { MetarQnh } from '../lib/metar';
import type { Tone } from './feedLine';

export interface QnhStatusInput {
  qnhInHg: number;
  auto: boolean;
  station: string;
  report: MetarQnh | null;
}

const pad = (n: number) => String(n).padStart(2, '0');
const zulu = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}Z`;
};

export interface QnhStatus {
  /** The altimeter setting, in inHg. */
  value: string;
  /** Where the setting came from: the station and its observation time, or what stands for them. */
  source: string;
  /** What is wrong with the source, if anything. */
  cls: Tone | null;
}

/** Top-bar readout of the altimeter setting and where it came from. */
export function qnhStatus(s: QnhStatusInput): QnhStatus {
  const value = s.qnhInHg.toFixed(2);
  if (!s.auto) return { value, source: 'MAN', cls: null };
  if (!s.report) return { value, source: `${s.station} --.--`.trim(), cls: 'warn' };
  return { value, source: `${s.station} ${zulu(s.report.observedAt)}`, cls: null };
}
