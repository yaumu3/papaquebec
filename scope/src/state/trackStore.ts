import type { AircraftReport, AircraftSnapshot } from '../lib/aircraft';
import type { ProjectFn } from '../lib/geo';
import type { Fix, OperatorState, Position, Readings, Sample, Track } from './track';

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

/** What the operator has set on a new track: nothing yet. */
export function freshOps(): OperatorState {
  return { hideTrail: false, dir: null, movedAt: null, manual: false };
}

function readingsOf(a: AircraftReport): Readings {
  return {
    alt: a.alt,
    gs: a.gs,
    track: a.track,
    heading: a.heading,
    verticalRate: a.verticalRate,
    nic: a.nic,
    nacP: a.nacP,
    messages: a.messages,
    rssi: a.rssi,
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
  };
}

function appendFix(history: Fix[], position: Position, t: number, alt: Track['alt']): void {
  if (position.kind !== 'live') return;
  const last = history[history.length - 1];
  if (last && last.x === position.x && last.y === position.y) return;
  history.push({ lat: position.lat, lon: position.lon, x: position.x, y: position.y, t, alt });
}

/**
 * Whether the target was heard since its last sample: its message count changed, up or, after a
 * receiver restart, down; or, from a feed that counts none, its last message is younger than
 * that sample. Never twice at one snapshot time.
 */
function heardSince(last: Sample | undefined, r: Readings, now: number): boolean {
  if (!last) return true;
  if (now <= last.t) return false;
  if (r.messages !== undefined && last.messages !== undefined) return r.messages !== last.messages;
  return r.seen < now - last.t;
}

/** Messages per second between the last sample and this one, when both count them and the count has not been reset. */
function rateSince(last: Sample | undefined, r: Readings, now: number): number | undefined {
  if (!last || r.messages === undefined || last.messages === undefined) return undefined;
  if (r.messages < last.messages) return undefined;
  return (r.messages - last.messages) / (now - last.t);
}

function appendSample(samples: Sample[], r: Readings, now: number): void {
  const last = samples[samples.length - 1];
  if (!heardSince(last, r, now)) return;
  samples.push({ ...r, t: now, messageRate: rateSince(last, r, now) });
}

function trimOld(items: { t: number }[], now: number): void {
  const cutoff = now - HISTORY_RETENTION_SEC;
  let drop = 0;
  while (drop < items.length && (items[drop]?.t ?? now) < cutoff) drop++;
  if (drop > 0) items.splice(0, drop);
}

function toTrack(
  a: AircraftReport,
  previous: Track | undefined,
  now: number,
  project: ProjectFn,
): Track {
  const readings = readingsOf(a);
  const position = positionOf(a, project);
  const history = previous?.history ?? [];
  appendFix(history, position, now, a.alt);
  trimOld(history, now);
  const samples = previous?.samples ?? [];
  appendSample(samples, readings, now);
  trimOld(samples, now);
  return {
    ...readings,
    messageRate: samples.at(-1)?.messageRate,
    hex: a.hex,
    flight: a.flight,
    squawk: a.squawk,
    category: a.category,
    type: a.type,
    registration: a.registration,
    description: a.description,
    emergency: a.emergency,
    position,
    history,
    samples,
    ops: previous?.ops ?? freshOps(),
  };
}

/**
 * The track store is rebuilt from every snapshot. Only position history, samples and operator
 * state carry over, because the feed does not carry them.
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
