import type { AircraftJson, AircraftSnapshot } from './aircraft';
import { isRecord, isNum } from './guards';

/**
 * tar1090's own track history: `chunks/chunks.json` names gzipped chunk files,
 * each holding `files`, an array of compact snapshots whose aircraft are
 * `[hex, alt_baro, gs, track, lat, lon, seen, type, flight, messages]`.
 */

export function parseChunkIndex(raw: unknown): string[] {
  if (!isRecord(raw) || !Array.isArray(raw.chunks)) return [];
  return raw.chunks.filter((c): c is string => typeof c === 'string');
}

function aircraftOf(row: unknown): AircraftJson | null {
  if (!Array.isArray(row) || typeof row[0] !== 'string') return null;
  const [hex, alt, gs, track, lat, lon, seen, type, flight, messages] = row;
  // History exists for trails; a record without a position has nothing to add.
  if (!isNum(lat) || !isNum(lon)) return null;
  const a: AircraftJson = { hex };
  if (isNum(alt) || alt === 'ground') a.alt_baro = alt;
  if (isNum(gs)) a.gs = gs;
  if (isNum(track)) a.track = track;
  a.lat = lat;
  a.lon = lon;
  if (isNum(seen)) {
    a.seen = seen;
    a.seen_pos = seen;
  }
  if (typeof flight === 'string') a.flight = flight;
  if (isNum(messages)) a.messages = messages;
  if (typeof type === 'string') {
    if (type.startsWith('mlat')) a.mlat = ['lat', 'lon'];
    else if (type.startsWith('tisb')) a.tisb = ['lat', 'lon'];
  }
  return a;
}

export function chunkToSnapshots(raw: unknown): AircraftSnapshot[] {
  if (!isRecord(raw) || !Array.isArray(raw.files)) return [];
  const out: AircraftSnapshot[] = [];
  for (const f of raw.files) {
    if (!isRecord(f) || !isNum(f.now) || !Array.isArray(f.aircraft)) continue;
    const aircraft: AircraftJson[] = [];
    for (const row of f.aircraft) {
      const a = aircraftOf(row);
      if (a) aircraft.push(a);
    }
    out.push({ now: f.now, messages: isNum(f.messages) ? f.messages : 0, aircraft });
  }
  return out;
}
