/** The altimeter setting carried by a METAR, with where and when it was observed. */
import type { LatLon } from './aircraft';
import { HPA_PER_INHG } from './units';
export interface MetarQnh {
  station: string;
  /** Observation time, ms since the epoch. */
  observedAt: number;
  qnhInHg: number;
}

/** A station's report, with where the station stands. */
export type StationReport = MetarQnh & LatLon;

export function hpaToInHg(hpa: number): number {
  return Math.round((hpa / HPA_PER_INHG) * 100) / 100;
}
