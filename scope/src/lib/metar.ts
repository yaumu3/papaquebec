/** The altimeter setting carried by a METAR, with where and when it was observed. */
import { HPA_PER_INHG } from './units';
export interface MetarQnh {
  station: string;
  /** Observation time, ms since the epoch, resolved against the current month. */
  observedAt: number;
  qnhInHg: number;
}

export function hpaToInHg(hpa: number): number {
  return Math.round((hpa / HPA_PER_INHG) * 100) / 100;
}

const HEADER = /\b([A-Z][A-Z0-9]{3}) (\d{2})(\d{2})(\d{2})Z\b/;
const Q_GROUP = /\bQ(\d{4})\b/;
const A_GROUP = /\bA(\d{4})\b/;

/** A day-of-month later than today's belongs to the previous month. */
function observedAt(day: number, hour: number, minute: number, now: Date): number {
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  if (day > now.getUTCDate()) {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  }
  return Date.UTC(year, month, day, hour, minute);
}

/** Pulls station, time and QNH out of raw METAR text; null when any of them is missing. */
export function parseMetarQnh(raw: string, now: Date): MetarQnh | null {
  const header = HEADER.exec(raw);
  if (!header) return null;
  const [, station, day, hour, minute] = header;
  const q = Q_GROUP.exec(raw);
  const a = A_GROUP.exec(raw);
  const qnhInHg = q ? hpaToInHg(Number(q[1])) : a ? Number(a[1]) / 100 : null;
  if (qnhInHg === null || !station) return null;
  return {
    station,
    observedAt: observedAt(Number(day), Number(hour), Number(minute), now),
    qnhInHg,
  };
}
