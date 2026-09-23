/**
 * readsb globe-history trace files (`trace_full_<hex>.json`): a start time
 * and rows of `[dt, lat, lon, alt, gs, track, flags, vrate, ...]`.
 */
import { isRecord, isNum } from './guards';
export interface TracePoint {
  /** Seconds since epoch. */
  t: number;
  lat: number;
  lon: number;
  alt: number | 'ground' | undefined;
}

export interface Trace {
  hex: string;
  points: TracePoint[];
}

function pointOf(row: unknown, start: number): TracePoint | null {
  if (!Array.isArray(row) || !isNum(row[0]) || !isNum(row[1]) || !isNum(row[2])) return null;
  const alt = row[3];
  return {
    t: start + row[0],
    lat: row[1],
    lon: row[2],
    alt: isNum(alt) ? alt : alt === 'ground' ? 'ground' : undefined,
  };
}

/** Positions in time order; rows without a position are dropped. Null if the payload is not a trace. */
export function parseTrace(raw: unknown): Trace | null {
  if (
    !isRecord(raw) ||
    typeof raw.icao !== 'string' ||
    !isNum(raw.timestamp) ||
    !Array.isArray(raw.trace)
  ) {
    return null;
  }
  const start = raw.timestamp;
  const points: TracePoint[] = [];
  for (const row of raw.trace) {
    const p = pointOf(row, start);
    if (p) points.push(p);
  }
  return { hex: raw.icao, points };
}
