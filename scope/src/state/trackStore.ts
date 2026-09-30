import type { AircraftReport, AircraftSnapshot } from '../lib/aircraft';
import type { ProjectFn } from '../lib/geo';
import type { Fix, OperatorState, Position, Track } from './track';

export const HISTORY_RETENTION_SEC = 3600;

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

function positionOf(a: AircraftReport, project: ProjectFn): Position {
  if (a.position) {
    return { kind: 'live', ...a.position, ...project(a.position.lat, a.position.lon) };
  }
  if (a.lastPosition) {
    return { kind: 'last', ...a.lastPosition, ...project(a.lastPosition.lat, a.lastPosition.lon) };
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
  a: AircraftReport,
  previous: Track | undefined,
  now: number,
  project: ProjectFn,
): Track {
  const position = positionOf(a, project);
  const history = previous?.history ?? [];
  appendFix(history, position, now, a.alt);
  trimHistory(history, now);
  return {
    hex: a.hex,
    flight: a.flight,
    squawk: a.squawk,
    category: a.category,
    alt: a.alt,
    gs: a.gs,
    track: a.track,
    verticalRate: a.verticalRate,
    nic: a.nic,
    nacP: a.nacP,
    messages: a.messages,
    rssi: a.rssi,
    type: a.type,
    registration: a.registration,
    description: a.description,
    emergency: a.emergency,
    tas: a.tas,
    ias: a.ias,
    mach: a.mach,
    windSpeed: a.windSpeed,
    windDir: a.windDir,
    oat: a.oat,
    tat: a.tat,
    selAlt: a.selAlt,
    fmsAlt: a.fmsAlt,
    selHeading: a.selHeading,
    navQnh: a.navQnh,
    navModes: a.navModes,
    source: a.source ?? 'adsb',
    seen: a.seen ?? 0,
    seenPos: a.seenPos,
    position,
    history,
    ops: previous?.ops ?? freshOps(),
  };
}

/**
 * The track store is rebuilt from every snapshot. Only position history and
 * operator state carry over, because the feed does not carry them.
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
