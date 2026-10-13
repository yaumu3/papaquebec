import { createSignal } from 'solid-js';

import { nearest } from '../lib/geo';
import type { MetarQnh, StationReport } from '../lib/metar';
import { type Site, site } from './scope';
import { settings } from './settings';

/** The current reports of the stations around the receiver, as the feed last told them. */
export const [qnhReports, setQnhReports] = createSignal<StationReport[]>([]);

/** The chosen station's report, else the one nearest the site; none while neither is in. */
export function reportFor(
  station: string,
  at: Site | null,
  reports: readonly StationReport[],
): StationReport | null {
  if (station) return reports.find((r) => r.station === station) ?? null;
  return at ? nearest(at.lat, at.lon, reports) : null;
}

/** The report the altimeter follows. */
export function qnhReport(): MetarQnh | null {
  return reportFor(settings.qnh.station, site(), qnhReports());
}

/** The station currently reporting, else the chosen one; empty until either is known. */
export function qnhStation(): string {
  return settings.qnh.station || (qnhReport()?.station ?? '');
}
