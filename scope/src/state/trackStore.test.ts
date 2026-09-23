import { describe, expect, it } from 'bun:test';

import type { AircraftJson, AircraftSnapshot } from '../lib/aircraft';
import { createTrackStore, HISTORY_RETENTION_SEC } from './trackStore';

/** Equirectangular stub: 1° = 60 NM, good enough to check that projection is applied. */
const project = (lat: number, lon: number) => ({ x: (lon - 130) * 60, y: (lat - 33) * 60 });

const doubled = (lat: number, lon: number) => ({ x: (lon - 130) * 120, y: (lat - 33) * 120 });

function snapshot(now: number, aircraft: AircraftJson[], messages = 0): AircraftSnapshot {
  return { now, messages, aircraft };
}

const live = (hex: string, lat = 33.5, lon = 130.5): AircraftJson => ({
  hex,
  lat,
  lon,
  seen: 0.2,
  seen_pos: 0.2,
  alt_baro: 11000,
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

  it('preserves operator state across snapshots', () => {
    // Arrange
    const store = createTrackStore(project);
    store.ingest(snapshot(1000, [live('a')]));
    const before = store.tracks.get('a');
    if (before) {
      before.ops.hideTrail = true;
      before.ops.pinnedCorner = 'sw';
    }

    // Act
    store.ingest(snapshot(1001, [live('a')]));

    // Assert
    expect(store.tracks.get('a')?.ops).toEqual({
      hideTrail: true,
      pinnedCorner: 'sw',
      autoCorner: 'ne',
    });
  });

  it('classifies the position source from the mlat and tisb field lists', () => {
    // Arrange
    const store = createTrackStore(project);
    const aircraft: AircraftJson[] = [
      { ...live('adsb') },
      { ...live('mlat'), mlat: ['lat', 'lon', 'track'] },
      { ...live('tisb'), tisb: ['lat', 'lon'] },
      { ...live('mlatalt'), mlat: ['alt_baro'] },
    ];

    // Act
    store.ingest(snapshot(1000, aircraft));

    // Assert
    expect(store.tracks.get('adsb')?.source).toBe('adsb');
    expect(store.tracks.get('mlat')?.source).toBe('mlat');
    expect(store.tracks.get('tisb')?.source).toBe('tisb');
    expect(store.tracks.get('mlatalt')?.source).toBe('adsb');
  });

  it('falls back from live position to lastPosition, then rr, then none', () => {
    // Arrange
    const store = createTrackStore(project);
    const aircraft: AircraftJson[] = [
      { hex: 'last', seen: 40, lastPosition: { lat: 34, lon: 131, seen_pos: 40 } }, // Yamaguchi
      { hex: 'rr', seen: 5, rr_lat: 34, rr_lon: 131 }, // Yamaguchi
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
    expect(store.tracks.get('rr')?.position).toEqual({ kind: 'rr', lat: 34, lon: 131 });
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
    const a: AircraftJson = {
      ...live('a'),
      flight: 'ANA241  ',
      squawk: '2431',
      category: 'A3',
      gs: 290,
      track: 235,
      baro_rate: -1200,
      nic: 8,
      nac_p: 9,
      messages: 50,
      rssi: -12.3,
      t: 'B789',
      r: 'JA893A',
      emergency: 'none',
    };

    // Act
    store.ingest(snapshot(1000, [a]));

    // Assert
    expect(store.tracks.get('a')).toMatchObject({
      flight: 'ANA241',
      squawk: '2431',
      category: 'A3',
      gs: 290,
      track: 235,
      baroRate: -1200,
      nic: 8,
      nacP: 9,
      messages: 50,
      rssi: -12.3,
      type: 'B789',
      registration: 'JA893A',
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

  it('leaves altitude unknown when only geometric altitude is reported', () => {
    // Arrange
    const store = createTrackStore(project);
    const a: AircraftJson = { hex: 'a', lat: 33.5, lon: 130.5, seen: 0.1, alt_geom: 4250 }; // south of RJFF

    // Act
    store.ingest(snapshot(1000, [a]));

    // Assert
    expect(store.tracks.get('a')?.alt).toBeUndefined();
  });
});

describe('createTrackStore air data', () => {
  it('carries the air data speeds, wind and temperatures when readsb reports them', () => {
    // Arrange
    const store = createTrackStore(project);
    const withAir: AircraftJson = {
      ...live('a'),
      ws: 14,
      wd: 255,
      oat: 13,
      tat: 23,
      tas: 282,
      ias: 229,
      mach: 0.428,
    };

    // Act
    store.ingest(snapshot(1000, [withAir, live('b')]));

    // Assert
    const a = store.tracks.get('a');
    const b = store.tracks.get('b');
    expect([a?.windSpeed, a?.windDir, a?.oat, a?.tat]).toEqual([14, 255, 13, 23]);
    expect([a?.tas, a?.ias, a?.mach]).toEqual([282, 229, 0.428]);
    expect([b?.windSpeed, b?.windDir, b?.oat, b?.tat]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});
