import { describe, expect, it } from 'bun:test';

import { create, fromBinary } from '@bufbuild/protobuf';

import type { AircraftReport } from '../lib/aircraft';
import { messageOf } from './decode';
import { FrameSchema } from './gen/papaquebec/feed/v1/feed_pb';

const testdata = (name: string) => Bun.file(`${import.meta.dir}/../../../proto/testdata/${name}`);

const snapshotAt = (now: number) => ({ now, messages: 0, aircraft: [{ hex: 'd00001' }] });

describe('messageOf', () => {
  it("reads the tracker's pinned bytes as the aircraft they were made from", async () => {
    // Arrange
    const frame = fromBinary(FrameSchema, await testdata('snapshot.bin').bytes());

    // Act
    const message = messageOf(frame);

    // Assert: one known in full, one on the ground placed by multilateration, one with a
    // last position besides its current one, and one known by its address only
    const aircraft: AircraftReport[] = [
      {
        hex: 'd00001',
        flight: 'TEST01',
        squawk: '0421',
        category: 'A3',
        emergency: 'none',
        ident: true,
        ra: {
          multipleThreats: false,
          terminated: false,
          advisory: {
            corrective: true,
            downward: false,
            increasedRate: false,
            senseReversal: false,
            altitudeCrossing: false,
            positive: true,
          },
        },
        position: { lat: 33.5, lon: 130.5 },
        alt: 35000,
        gs: 451.2,
        track: 182.9,
        heading: 176.1,
        verticalRate: -832,
        ias: 280,
        tas: 440,
        mach: 0.78,
        selAlt: 6000,
        fmsAlt: 5000,
        selHeading: 210.2,
        navQnh: 1013.6,
        navModes: ['autopilot', 'vnav', 'althold', 'approach', 'lnav', 'tcas'],
        nic: 8,
        nacP: 9,
        windSpeed: 35,
        windDir: 270,
        oat: -52,
        tat: -25,
        registration: 'TEST-01',
        type: 'B789',
        description: 'TEST TYPE',
        messages: 1234,
        rssi: -12.5,
        seen: 0.3,
        seenPos: 1.2,
      },
      {
        hex: '~d00002',
        squawk: '7700',
        category: 'C1',
        emergency: 'general',
        position: { lat: 33.25, lon: 130.25 },
        source: 'mlat',
        alt: 'ground',
        navModes: [],
        seen: 0,
      },
      {
        hex: 'd00003',
        position: { lat: 33, lon: 130 },
        lastPosition: { lat: 32.5, lon: 129.5 },
        source: 'tisb',
        alt: 0,
      },
      { hex: 'd00004' },
    ];
    const snapshot = { now: 1700000000.5, messages: 42, aircraft };
    expect(message).toStrictEqual({ kind: 'snapshot', snapshot });
  });

  it('takes the geometric vertical rate of an aircraft that reports no barometric one', () => {
    // Arrange
    const rates = [
      { baroVerticalRateFpm: -1200, geometricVerticalRateFpm: -1100 },
      { geometricVerticalRateFpm: 1856 },
      {},
    ];
    const frame = create(FrameSchema, {
      body: { case: 'snapshot', value: { aircraft: rates } },
    });

    // Act
    const message = messageOf(frame);

    // Assert
    const read = message?.kind === 'snapshot' ? message.snapshot.aircraft : [];
    expect(read.map((a) => a.verticalRate)).toEqual([-1200, 1856, undefined]);
  });

  it('leaves the altitude unknown of an aircraft that reports only its GNSS height', () => {
    // Arrange
    const frame = create(FrameSchema, {
      body: { case: 'snapshot', value: { aircraft: [{ geometricAltitudeFt: 4250 }] } },
    });

    // Act
    const message = messageOf(frame);

    // Assert
    const read = message?.kind === 'snapshot' ? message.snapshot.aircraft : [];
    expect(read.map((a) => a.alt)).toEqual([undefined]);
  });

  it('reads a frame that carries nothing it knows as nothing', () => {
    // Arrange
    const frame = create(FrameSchema);

    // Act
    const message = messageOf(frame);

    // Assert
    expect(message).toBeNull();
  });

  it('reads a hello as the receiver it greets with', () => {
    // Arrange
    const receiver = { latDeg: 33.5844, lonDeg: 130.4517 }; // RJFF
    const frame = create(FrameSchema, { body: { case: 'hello', value: { receiver } } });

    // Act
    const message = messageOf(frame);

    // Assert
    expect(message).toEqual({
      kind: 'hello',
      receiver: { lat: 33.5844, lon: 130.4517 },
      history: [],
    });
  });

  it('reads the history a hello brings as snapshots, oldest first', () => {
    // Arrange
    const history = [8, 16].map((nowS) => ({ nowS, aircraft: [{ address: { value: 0xd00001 } }] }));
    const frame = create(FrameSchema, { body: { case: 'hello', value: { history } } });

    // Act
    const message = messageOf(frame);

    // Assert
    expect(message).toEqual({
      kind: 'hello',
      receiver: {},
      history: [snapshotAt(8), snapshotAt(16)],
    });
  });

  it('reads a receiver without a position as one that does not know it', () => {
    // Arrange
    const frame = create(FrameSchema, { body: { case: 'hello', value: { receiver: {} } } });

    // Act
    const message = messageOf(frame);

    // Assert
    expect(message).toStrictEqual({ kind: 'hello', receiver: {}, history: [] });
  });

  it("reads the weather as the stations' reports, observed in milliseconds", () => {
    // Arrange
    const qnh = [
      {
        station: 'RJTT',
        latDeg: 35.553,
        lonDeg: 139.781,
        observedS: 1_790_074_800,
        qnhInHg: 29.94,
      },
      {
        station: 'RJAA',
        latDeg: 35.765,
        lonDeg: 140.386,
        observedS: 1_790_074_800,
        qnhInHg: 29.92,
      },
    ];
    const frame = create(FrameSchema, { body: { case: 'weather', value: { qnh } } });

    // Act
    const message = messageOf(frame);

    // Assert
    expect(message).toEqual({
      kind: 'weather',
      reports: [
        {
          station: 'RJTT',
          lat: 35.553,
          lon: 139.781,
          observedAt: 1_790_074_800_000,
          qnhInHg: 29.94,
        },
        {
          station: 'RJAA',
          lat: 35.765,
          lon: 140.386,
          observedAt: 1_790_074_800_000,
          qnhInHg: 29.92,
        },
      ],
    });
  });
});
