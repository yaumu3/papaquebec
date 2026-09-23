import type { AircraftJson, AircraftSnapshot } from '../lib/aircraft';
import type { Fix, OperatorState, Position, Source, Track } from './track';

export const HISTORY_RETENTION_SEC = 600;

export type ProjectFn = (lat: number, lon: number) => { x: number; y: number };

export interface FeedStats {
  /** Snapshot time, seconds since epoch. */
  now: number;
  /** Messages per second between the last two snapshots. */
  messageRate: number;
  messages: number;
}

export interface TrackStore {
  readonly tracks: Map<string, Track>;
  readonly stats: FeedStats;
  ingest(snapshot: AircraftSnapshot): void;
  /** Swap the projection and rebuild every projected coordinate, history included. */
  reproject(project: ProjectFn): void;
}

function sourceOf(a: AircraftJson): Source {
  if (a.mlat?.includes('lat')) return 'mlat';
  if (a.tisb?.includes('lat')) return 'tisb';
  return 'adsb';
}

function positionOf(a: AircraftJson, project: ProjectFn): Position {
  if (a.lat !== undefined && a.lon !== undefined) {
    return { kind: 'live', lat: a.lat, lon: a.lon, ...project(a.lat, a.lon) };
  }
  if (a.lastPosition) {
    const { lat, lon } = a.lastPosition;
    return { kind: 'last', lat, lon, ...project(lat, lon) };
  }
  if (a.rr_lat !== undefined && a.rr_lon !== undefined) {
    return { kind: 'rr', lat: a.rr_lat, lon: a.rr_lon };
  }
  return { kind: 'none' };
}

function freshOps(): OperatorState {
  return { hideTrail: false, pinnedCorner: null, autoCorner: 'ne' };
}

function appendFix(history: Fix[], position: Position, t: number, alt: Track['alt']): void {
  if (position.kind !== 'live') return;
  const last = history[history.length - 1];
  if (last && last.x === position.x && last.y === position.y) return;
  history.push({ lat: position.lat, lon: position.lon, x: position.x, y: position.y, t, alt });
}

function trimHistory(history: Fix[], now: number): void {
  const cutoff = now - HISTORY_RETENTION_SEC;
  let drop = 0;
  while (drop < history.length && (history[drop]?.t ?? now) < cutoff) drop++;
  if (drop > 0) history.splice(0, drop);
}

function toTrack(
  a: AircraftJson,
  previous: Track | undefined,
  now: number,
  project: ProjectFn,
): Track {
  const position = positionOf(a, project);
  const history = previous?.history ?? [];
  appendFix(history, position, now, a.alt_baro);
  trimHistory(history, now);
  return {
    hex: a.hex,
    flight: a.flight?.trim() || undefined,
    squawk: a.squawk,
    category: a.category,
    alt: a.alt_baro,
    gs: a.gs,
    track: a.track,
    baroRate: a.baro_rate,
    nic: a.nic,
    nacP: a.nac_p,
    messages: a.messages,
    rssi: a.rssi,
    type: a.t,
    registration: a.r,
    description: a.desc,
    emergency: a.emergency,
    tas: a.tas,
    ias: a.ias,
    mach: a.mach,
    windSpeed: a.ws,
    windDir: a.wd,
    oat: a.oat,
    tat: a.tat,
    source: sourceOf(a),
    seen: a.seen ?? 0,
    seenPos: a.seen_pos,
    position,
    history,
    ops: previous?.ops ?? freshOps(),
  };
}

/**
 * The track store is rebuilt from every snapshot. Only position history and
 * operator state carry over, because readsb does not hold them.
 */
export function createTrackStore(initialProject: ProjectFn): TrackStore {
  let project = initialProject;
  const tracks = new Map<string, Track>();
  const stats: FeedStats = { now: 0, messageRate: 0, messages: 0 };

  return {
    tracks,
    stats,
    ingest(snapshot) {
      if (snapshot.now < stats.now) return;
      const previous = new Map(tracks);
      tracks.clear();
      for (const a of snapshot.aircraft) {
        tracks.set(a.hex, toTrack(a, previous.get(a.hex), snapshot.now, project));
      }
      const dt = snapshot.now - stats.now;
      if (stats.now > 0 && dt > 0) {
        stats.messageRate = Math.max(0, (snapshot.messages - stats.messages) / dt);
      }
      stats.now = snapshot.now;
      stats.messages = snapshot.messages;
    },
    reproject(next) {
      project = next;
      for (const t of tracks.values()) {
        const p = t.position;
        if (p.kind === 'live' || p.kind === 'last') Object.assign(p, project(p.lat, p.lon));
        for (const f of t.history) Object.assign(f, project(f.lat, f.lon));
      }
    },
  };
}
