import { createSignal } from 'solid-js';

import { rankByDistance } from '../lib/geo';
import type { MetarQnh } from '../lib/metar';
import { aero, site } from './scope';
import { settings } from './settings';

/** Re-ask the METAR source this often; reports change half-hourly at most. */
export const QNH_POLL_MS = 10 * 60_000;
/** How many airports around the site to try before giving up on an automatic station. */
const NEAREST_TRIED = 5;

export const [qnhReport, setQnhReport] = createSignal<MetarQnh | null>(null);
export const [qnhError, setQnhError] = createSignal<string | null>(null);

/** Stations to ask, in order: the operator's choice alone, else the nearest airports. */
export function stationCandidates(): string[] {
  if (settings.qnh.station) return [settings.qnh.station];
  const s = site();
  if (!s) return [];
  return rankByDistance(s.lat, s.lon, aero().airports)
    .slice(0, NEAREST_TRIED)
    .map((a) => a.id);
}

/** The station currently answering, else the chosen one; empty until either is known. */
export function qnhStation(): string {
  return settings.qnh.station || (qnhReport()?.station ?? '');
}
