import { describe, expect, it } from 'bun:test';

import type { AircraftReport, AircraftSnapshot } from '../lib/aircraft';
import { createTrackStore, HISTORY_RETENTION_SEC } from './trackStore';

/** Equirectangular stub: 1° = 60 NM, good enough to check that projection is applied. */
const project = (lat: number, lon: number) => ({ x: (lon - 130) * 60, y: (lat - 33) * 60 });

const doubled = (lat: number, lon: number) => ({ x: (lon - 130) * 120, y: (lat - 33) * 120 });

function snapshot(now: number, aircraft: AircraftReport[], messages = 0): AircraftSnapshot {
  return { now, messages, aircraft };
}

const live = (hex: string, lat = 33.5, lon = 130.5): AircraftReport => ({
  hex,
  position: { lat, lon },
  seen: 0.2,
  seenPos: 0.2,
  alt: 11000,
});

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
      before.ops.hideTrail = true;
      before.ops.dir = 3;
    }

    // Act
    store.ingest(snapshot(1001, [live('a')]));

    // Assert
    expect(store.tracks.get('a')?.ops).toEqual({
      hideTrail: true,
      dir: 3,
      movedAt: null,
      manual: false,
    });
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

  it('falls back from live position to lastPosition, then none', () => {
    // Arrange
    const store = createTrackStore(project);
    const aircraft: AircraftReport[] = [
      { hex: 'last', seen: 40, lastPosition: { lat: 34, lon: 131 } }, // Yamaguchi
      { hex: 'none', seen: 1 },
    ];

    // Act
    store.ingest(snapshot(1000, aircraft));

    // Assert
    expect(store.tracks.get('last')?.position).toEqual({
      kind: 'last',
      lat: 34,
      lon: 131,
      x: 60,
      y: 60,
    });
    expect(store.tracks.get('none')?.position).toEqual({ kind: 'none' });
    expect(store.tracks.get('last')?.history).toEqual([]);
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
      seen: 0.2,
      seenPos: 0.2,
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
    store.ingest(snapshot(1001, [heard('a', 10, { seen: 1.2 })]));

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
    store.ingest(snapshot(1003, [heard('a', 30, { seen: 1.2 })]));

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

  it('goes by the age of the last message when the feed counts none', () => {
    // Arrange
    const store = createTrackStore(project);
    store.ingest(snapshot(1000, [{ ...live('a'), seen: 0.2 }]));
    store.ingest(snapshot(1001, [{ ...live('a'), seen: 1.2 }]));

    // Act
    store.ingest(snapshot(1002, [{ ...live('a'), seen: 0.4 }]));

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
      seen: 0.3,
      seenPos: 2.5,
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
      seen: 0.3,
      seenPos: 2.5,
    });
  });
});
