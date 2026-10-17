import { describe, expect, it } from 'bun:test';

import type { AircraftReport, AircraftSnapshot } from '../lib/aircraft';
import { EMERGENCY_SEC } from '../lib/reports';
import { createTrackStore, HISTORY_RETENTION_SEC, REMEMBERED_SEC } from './trackStore';

/** Equirectangular stub: 1° = 60 NM, good enough to check that projection is applied. */
const project = (lat: number, lon: number) => ({ x: (lon - 130) * 60, y: (lat - 33) * 60 });

const doubled = (lat: number, lon: number) => ({ x: (lon - 130) * 120, y: (lat - 33) * 120 });

/** A snapshot at `now`, each report's message and position heard then unless it says when. */
function snapshot(now: number, aircraft: AircraftReport[], messages = 0): AircraftSnapshot {
  const stamped = aircraft.map((a) => ({
    ...a,
    heard: { messages: now, ...(a.position && { position: now }), ...a.heard },
  }));
  return { now, messages, aircraft: stamped };
}

/** A target heard with its position. */
const live = (hex: string, lat = 33.5, lon = 130.5): AircraftReport => ({
  hex,
  position: { lat, lon },
  alt: 11000,
  heard: {},
});

/** A target reporting the ident or its end, heard at `heardAt`. */
const identing = (hex: string, ident: boolean, heardAt: number): AircraftReport => ({
  ...live(hex),
  ident,
  heard: { ...live(hex).heard, ident: heardAt },
});

/** A target declaring a general emergency with no code, heard at `heardAt`. */
const declaring = (hex: string, heardAt: number): AircraftReport => ({
  ...live(hex),
  squawk: '2253',
  emergency: 'general',
  heard: { ...live(hex).heard, emergency: heardAt },
});

/** A target whose last message was heard at `messages` seconds, with no count of them. */
const heardLast = (messages: number): AircraftReport => ({ ...live('a'), heard: { messages } });

describe('createTrackStore', () => {
  it('rebuilds from each snapshot, dropping tracks that are absent', () => {
    // Arrange
    const store = createTrackStore(project);
    store.ingest(snapshot(1000, [live('a'), live('b')]));

    // Act
    store.ingest(snapshot(1001, [live('b'), live('c')]));

    // Assert
    expect([...store.tracks.keys()].toSorted()).toEqual(['b', 'c']);
  });

  it('projects live positions into nautical miles at ingest', () => {
    // Arrange
    const store = createTrackStore(project);

    // Act
    store.ingest(snapshot(1000, [live('a', 34, 131)])); // Yamaguchi

    // Assert
    const t = store.tracks.get('a');
    expect(t?.position).toEqual({ kind: 'live', lat: 34, lon: 131, x: 60, y: 60 });
  });

  it('keeps position history across snapshots and only appends on movement', () => {
    // Arrange
    const store = createTrackStore(project);
    store.ingest(snapshot(1000, [live('a', 33.5, 130.5)])); // south of RJFF
    store.ingest(snapshot(1001, [live('a', 33.5, 130.5)]));

    // Act
    store.ingest(snapshot(1002, [live('a', 33.6, 130.5)])); // RJFF

    // Assert
    const h = store.tracks.get('a')?.history;
    expect(h?.map((f) => f.t)).toEqual([1000, 1002]);
    expect(h?.[1]?.x).toBeCloseTo(30, 9);
    expect(h?.[1]?.y).toBeCloseTo(36, 9);
    expect(h?.[1]?.alt).toBe(11000);
  });

  it('dates a fix by when its position was heard, not by the snapshot', () => {
    // Arrange
    const store = createTrackStore(project);
    const backfilled = { ...live('a'), heard: { messages: 1007, position: 1001.5 } };

    // Act
    store.ingest(snapshot(1008, [backfilled]));

    // Assert
    expect(store.tracks.get('a')?.history.map((f) => f.t)).toEqual([1001.5]);
  });

  it('trims history older than the retention window', () => {
    // Arrange
    const store = createTrackStore(project);
    store.ingest(snapshot(1000, [live('a', 33.5, 130.5)])); // south of RJFF
    store.ingest(snapshot(1000 + HISTORY_RETENTION_SEC / 2, [live('a', 33.6, 130.5)])); // RJFF

    // Act
    store.ingest(snapshot(1000 + HISTORY_RETENTION_SEC + 1, [live('a', 33.7, 130.5)])); // north of RJFF

    // Assert
    const h = store.tracks.get('a')?.history;
    expect(h?.map((f) => f.t)).toEqual([
      1000 + HISTORY_RETENTION_SEC / 2,
      1000 + HISTORY_RETENTION_SEC + 1,
    ]);
  });

  it('retains an hour of history', () => {
    // Arrange
    const store = createTrackStore(project);
    store.ingest(snapshot(1000, [live('a', 33.5, 130.5)])); // south of RJFF

    // Act
    store.ingest(snapshot(1000 + 3600, [live('a', 33.6, 130.5)])); // RJFF

    // Assert
    expect(store.tracks.get('a')?.history.map((f) => f.t)).toEqual([1000, 1000 + 3600]);
  });

  it('preserves operator state across snapshots', () => {
    // Arrange
    const store = createTrackStore(project);
    store.ingest(snapshot(1000, [live('a')]));
    const before = store.tracks.get('a');
    if (before) {
      before.ops.dir = 3;
      before.ops.manual = true;
    }

    // Act
    store.ingest(snapshot(1001, [live('a')]));

    // Assert
    expect(store.tracks.get('a')?.ops).toEqual({ dir: 3, movedAt: null, manual: true });
  });

  it("takes a position as the aircraft's own broadcast unless the feed says how it came", () => {
    // Arrange
    const store = createTrackStore(project);
    const aircraft: AircraftReport[] = [
      live('adsb'),
      { ...live('mlat'), source: 'mlat' },
      { ...live('tisb'), source: 'tisb' },
    ];

    // Act
    store.ingest(snapshot(1000, aircraft));

    // Assert
    const sources = ['adsb', 'mlat', 'tisb'].map((hex) => store.tracks.get(hex)?.source);
    expect(sources).toEqual(['adsb', 'mlat', 'tisb']);
  });

  it('places a target nowhere without a position, and keeps no fix of it', () => {
    // Arrange
    const store = createTrackStore(project);
    const aircraft: AircraftReport[] = [{ hex: 'none', heard: { messages: 999 } }];

    // Act
    store.ingest(snapshot(1000, aircraft));

    // Assert
    expect(store.tracks.get('none')?.position).toEqual({ kind: 'none' });
    expect(store.tracks.get('none')?.history).toEqual([]);
  });

  it('tells how long ago the target and its position were heard from their instants', () => {
    // Arrange
    const store = createTrackStore(project);
    const aircraft: AircraftReport[] = [
      { ...live('a'), heard: { messages: 999.75, position: 997.5 } },
      { hex: 'b', heard: { messages: 998 } },
    ];

    // Act
    store.ingest(snapshot(1000, aircraft));

    // Assert
    expect([store.tracks.get('a')?.seen, store.tracks.get('a')?.seenPos]).toEqual([0.25, 2.5]);
    expect([store.tracks.get('b')?.seen, store.tracks.get('b')?.seenPos]).toEqual([2, undefined]);
  });

  it('shows the ident while it is reported true and its report is fresh', () => {
    // Arrange
    const store = createTrackStore(project);
    const aircraft = [
      identing('fresh', true, 982.1),
      identing('lapsed', true, 982),
      identing('ended', false, 999.9),
    ];

    // Act
    store.ingest(snapshot(1000, aircraft));

    // Assert
    expect(['fresh', 'lapsed', 'ended'].map((hex) => store.tracks.get(hex)?.ident)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('shows the advisory while its report is fresh', () => {
    // Arrange
    const store = createTrackStore(project);
    const ra = { multipleThreats: false, terminated: false };
    const advised = (hex: string, heardAt: number): AircraftReport => ({
      ...live(hex),
      ra,
      heard: { ...live(hex).heard, ra: heardAt },
    });
    const aircraft = [advised('fresh', 982.1), advised('lapsed', 982)];

    // Act
    store.ingest(snapshot(1000, aircraft));

    // Assert
    expect([store.tracks.get('fresh')?.ra, store.tracks.get('lapsed')?.ra]).toEqual([
      ra,
      undefined,
    ]);
  });

  it('shows the emergency status while its report is fresh', () => {
    // Arrange
    const store = createTrackStore(project);
    const aircraft = [
      declaring('fresh', 1000 - EMERGENCY_SEC + 0.1),
      declaring('lapsed', 1000 - EMERGENCY_SEC),
    ];

    // Act
    store.ingest(snapshot(1000, aircraft));

    // Assert
    const [fresh, lapsed] = ['fresh', 'lapsed'].map((hex) => store.tracks.get(hex));
    expect([fresh?.emergency, lapsed?.emergency]).toEqual(['general', undefined]);
    expect(lapsed?.squawk).toBe('2253');
  });

  it('derives the message rate from the snapshot message counter', () => {
    // Arrange
    const store = createTrackStore(project);
    store.ingest(snapshot(1000, [], 5000));

    // Act
    store.ingest(snapshot(1002, [], 5040));

    // Assert
    expect(store.stats.messageRate).toBe(20);
    expect(store.stats.now).toBe(1002);
  });

  it('copies enrichment and readout fields onto the track', () => {
    // Arrange
    const store = createTrackStore(project);
    const a: AircraftReport = {
      ...live('a'),
      flight: 'TEST01',
      squawk: '2431',
      category: 'A3',
      gs: 290,
      track: 235,
      verticalRate: -1200,
      nic: 8,
      nacP: 9,
      messages: 50,
      rssi: -12.3,
      type: 'B789',
      registration: 'TEST-01',
      emergency: 'none',
      heard: { emergency: 1000 },
    };

    // Act
    store.ingest(snapshot(1000, [a]));

    // Assert
    expect(store.tracks.get('a')).toMatchObject({
      flight: 'TEST01',
      squawk: '2431',
      category: 'A3',
      gs: 290,
      track: 235,
      verticalRate: -1200,
      nic: 8,
      nacP: 9,
      messages: 50,
      rssi: -12.3,
      type: 'B789',
      registration: 'TEST-01',
      emergency: 'none',
      seen: 0,
      seenPos: 0,
    });
  });

  it('re-projects every track and its history when the projection changes', () => {
    // Arrange
    const store = createTrackStore(project);
    store.ingest(snapshot(1000, [live('a', 33.5, 130.5)])); // south of RJFF
    store.ingest(snapshot(1001, [live('a', 34, 131)])); // Yamaguchi

    // Act
    store.reproject(doubled);

    // Assert
    const t = store.tracks.get('a');
    expect(t?.position).toEqual({ kind: 'live', lat: 34, lon: 131, x: 120, y: 120 });
    expect(t?.history.map((f) => [f.x, f.y])).toEqual([
      [60, 60],
      [120, 120],
    ]);
  });

  it('ignores a snapshot older than the last one', () => {
    // Arrange
    const store = createTrackStore(project);
    store.ingest(snapshot(1000, [live('a', 33.5, 130.5)], 100)); // south of RJFF

    // Act
    store.ingest(snapshot(990, [live('a', 33.6, 130.5)], 90)); // RJFF

    // Assert
    expect(store.stats.now).toBe(1000);
    expect(store.tracks.get('a')?.history.map((f) => f.t)).toEqual([1000]);
  });
});

describe('createTrackStore readouts', () => {
  it('carries air data and autopilot intent when the feed reports them', () => {
    // Arrange
    const store = createTrackStore(project);
    const reported: AircraftReport = {
      ...live('a'),
      windSpeed: 14,
      windDir: 255,
      oat: 13,
      tat: 23,
      tas: 282,
      ias: 229,
      mach: 0.428,
      selAlt: 35008,
      fmsAlt: 35000,
      selHeading: 270.7,
      navQnh: 1013.6,
      navModes: ['autopilot', 'vnav', 'lnav'],
    };

    // Act
    store.ingest(snapshot(1000, [reported, live('b')]));

    // Assert
    const a = store.tracks.get('a');
    const b = store.tracks.get('b');
    expect([a?.windSpeed, a?.windDir, a?.oat, a?.tat]).toEqual([14, 255, 13, 23]);
    expect([a?.tas, a?.ias, a?.mach]).toEqual([282, 229, 0.428]);
    expect([a?.selAlt, a?.fmsAlt, a?.selHeading, a?.navQnh]).toEqual([35008, 35000, 270.7, 1013.6]);
    expect(a?.navModes).toEqual(['autopilot', 'vnav', 'lnav']);
    expect([b?.windSpeed, b?.tas, b?.selAlt, b?.selHeading, b?.navModes]).toEqual(
      Array(5).fill(undefined),
    );
  });
});

/** A target heard, its message count at `messages`. */
const heard = (hex: string, messages: number, over: Partial<AircraftReport> = {}) => ({
  ...live(hex),
  messages,
  ...over,
});

describe('createTrackStore samples', () => {
  it('takes a sample of every reading each time the target is heard', () => {
    // Arrange
    const store = createTrackStore(project);
    store.ingest(snapshot(1000, [heard('a', 10, { alt: 11000, gs: 290 })]));

    // Act
    store.ingest(snapshot(1001, [heard('a', 14, { alt: 10900, gs: 288 })]));

    // Assert
    const samples = store.tracks.get('a')?.samples;
    expect(samples?.map((s) => [s.t, s.alt, s.gs])).toEqual([
      [1000, 11000, 290],
      [1001, 10900, 288],
    ]);
  });

  it('takes no sample while nothing new is heard', () => {
    // Arrange
    const store = createTrackStore(project);
    store.ingest(snapshot(1000, [heard('a', 10)]));

    // Act
    store.ingest(snapshot(1001, [heard('a', 10)]));

    // Assert
    expect(store.tracks.get('a')?.samples.map((s) => s.t)).toEqual([1000]);
  });

  it('tells the message rate from the count since the sample before', () => {
    // Arrange
    const store = createTrackStore(project);
    store.ingest(snapshot(1000, [heard('a', 10)]));

    // Act
    store.ingest(snapshot(1002, [heard('a', 30)]));

    // Assert
    expect(store.tracks.get('a')?.samples.map((s) => s.messageRate)).toEqual([undefined, 10]);
  });

  it('tells the track the message rate of its latest sample', () => {
    // Arrange
    const store = createTrackStore(project);
    store.ingest(snapshot(1000, [heard('a', 10)]));
    store.ingest(snapshot(1002, [heard('a', 30)]));

    // Act
    store.ingest(snapshot(1003, [heard('a', 30)]));

    // Assert
    expect(store.tracks.get('a')?.messageRate).toBe(10);
  });

  it('takes a sample when the count falls back, as after a receiver restart, with no rate', () => {
    // Arrange
    const store = createTrackStore(project);
    store.ingest(snapshot(1000, [heard('a', 500)]));

    // Act
    store.ingest(snapshot(1001, [heard('a', 3)]));

    // Assert
    const samples = store.tracks.get('a')?.samples;
    expect(samples?.map((s) => [s.t, s.messageRate])).toEqual([
      [1000, undefined],
      [1001, undefined],
    ]);
  });

  it('takes one sample at most per snapshot time', () => {
    // Arrange
    const store = createTrackStore(project);
    store.ingest(snapshot(1000, [heard('a', 10)]));

    // Act
    store.ingest(snapshot(1000, [heard('a', 14)]));

    // Assert
    expect(store.tracks.get('a')?.samples.map((s) => s.t)).toEqual([1000]);
  });

  it('goes by the instant of the last message when the feed counts none', () => {
    // Arrange: heard at 999.8 s, then not until 1001.6 s
    const store = createTrackStore(project);
    store.ingest(snapshot(1000, [heardLast(999.8)]));
    store.ingest(snapshot(1001, [heardLast(999.8)]));

    // Act
    store.ingest(snapshot(1002, [heardLast(1001.6)]));

    // Assert
    expect(store.tracks.get('a')?.samples.map((s) => s.t)).toEqual([1000, 1002]);
  });

  it('trims samples older than the retention window', () => {
    // Arrange
    const store = createTrackStore(project);
    store.ingest(snapshot(1000, [heard('a', 1)]));
    store.ingest(snapshot(1000 + HISTORY_RETENTION_SEC / 2, [heard('a', 2)]));

    // Act
    store.ingest(snapshot(1000 + HISTORY_RETENTION_SEC + 1, [heard('a', 3)]));

    // Assert
    expect(store.tracks.get('a')?.samples.map((s) => s.t)).toEqual([
      1000 + HISTORY_RETENTION_SEC / 2,
      1000 + HISTORY_RETENTION_SEC + 1,
    ]);
  });

  it('carries every reading the detail panel plots', () => {
    // Arrange
    const store = createTrackStore(project);
    const reported: AircraftReport = {
      ...heard('a', 50),
      alt: 'ground',
      track: 235,
      verticalRate: -1200,
      ias: 229,
      tas: 282,
      mach: 0.428,
      oat: 13,
      tat: 23,
      navQnh: 1013.6,
      nic: 8,
      nacP: 9,
      rssi: -12.3,
      selAlt: 35008,
      fmsAlt: 35000,
      selHeading: 270.7,
      windDir: 255,
      windSpeed: 14,
      navModes: ['autopilot', 'lnav'],
      source: 'mlat',
      roll: -9.5,
      trackRate: -0.4,
      rc: 186,
      heard: { messages: 999.75, position: 997.5, alt: 999.75 },
    };

    // Act
    store.ingest(snapshot(1000, [reported]));

    // Assert
    expect(store.tracks.get('a')?.samples[0]).toEqual({
      t: 1000,
      messageRate: undefined,
      messages: 50,
      alt: 'ground',
      gs: undefined,
      track: 235,
      heading: undefined,
      verticalRate: -1200,
      roll: -9.5,
      trackRate: -0.4,
      ias: 229,
      tas: 282,
      mach: 0.428,
      oat: 13,
      tat: 23,
      navQnh: 1013.6,
      nic: 8,
      rc: 186,
      nacP: 9,
      rssi: -12.3,
      selAlt: 35008,
      fmsAlt: 35000,
      selHeading: 270.7,
      windDir: 255,
      windSpeed: 14,
      navModes: ['autopilot', 'lnav'],
      source: 'mlat',
      seen: 0.25,
      seenPos: 2.5,
      heard: { messages: 999.75, position: 997.5, alt: 999.75 },
      at: { lat: 33.5, lon: 130.5 },
    });
  });
});

describe('createTrackStore remembering', () => {
  it('keeps the history of a target that drops out, for when it is heard again', () => {
    // Arrange
    const store = createTrackStore(project);
    store.ingest(snapshot(1000, [heard('a', 10)]));
    store.ingest(snapshot(1001, []));

    // Act
    store.ingest(snapshot(1600, [heard('a', 30, { position: { lat: 33.6, lon: 130.5 } })])); // RJFF

    // Assert
    const t = store.tracks.get('a');
    expect(t?.history.map((f) => f.t)).toEqual([1000, 1600]);
    expect(t?.samples.map((s) => s.t)).toEqual([1000, 1600]);
  });

  it('keeps the operator state of a target that drops out, for when it is heard again', () => {
    // Arrange
    const store = createTrackStore(project);
    store.ingest(snapshot(1000, [live('a')]));
    const before = store.tracks.get('a');
    if (before) before.ops.dir = 3;
    store.ingest(snapshot(1001, []));

    // Act
    store.ingest(snapshot(1600, [live('a')]));

    // Assert
    expect(store.tracks.get('a')?.ops.dir).toBe(3);
  });

  it('keeps what a target left until fifteen minutes after it was last heard', () => {
    // Arrange
    const store = createTrackStore(project);
    store.ingest(snapshot(1000, [live('a')]));
    store.ingest(snapshot(1001, []));

    // Act
    store.ingest(snapshot(1000 + REMEMBERED_SEC - 1, [live('a', 33.6, 130.5)])); // RJFF

    // Assert
    expect(store.tracks.get('a')?.history.map((f) => f.t)).toEqual([
      1000,
      1000 + REMEMBERED_SEC - 1,
    ]);
  });

  it('starts a target anew fifteen minutes after it was last heard, as the tracker does', () => {
    // Arrange
    const store = createTrackStore(project);
    store.ingest(snapshot(1000, [live('a')]));
    const before = store.tracks.get('a');
    if (before) before.ops.dir = 3;
    store.ingest(snapshot(1001, []));

    // Act
    store.ingest(snapshot(1000 + REMEMBERED_SEC, [live('a', 33.6, 130.5)])); // RJFF

    // Assert
    const t = store.tracks.get('a');
    expect(t?.history.map((f) => f.t)).toEqual([1000 + REMEMBERED_SEC]);
    expect(t?.ops).toEqual({ dir: null, movedAt: null, manual: false });
  });

  it('re-projects what it keeps of a target that dropped out when the projection changes', () => {
    // Arrange
    const store = createTrackStore(project);
    store.ingest(snapshot(1000, [live('a', 34, 131)])); // Yamaguchi
    store.ingest(snapshot(1001, []));
    store.reproject(doubled);

    // Act
    store.ingest(snapshot(1600, [live('a', 33.5, 130.5)])); // south of RJFF

    // Assert
    expect(store.tracks.get('a')?.history.map((f) => [f.x, f.y])).toEqual([
      [120, 120],
      [60, 60],
    ]);
  });
});
