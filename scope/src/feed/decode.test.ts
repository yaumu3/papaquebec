import { describe, expect, it } from 'bun:test';

import { create, fromBinary } from '@bufbuild/protobuf';

import type { AircraftReport, Heard } from '../lib/aircraft';
import { messageOf } from './decode';
import { FrameSchema } from './gen/papaquebec/feed/v2/feed_pb';

const testdata = (name: string) => Bun.file(`${import.meta.dir}/../../../proto/testdata/${name}`);

const snapshotAt = (now: number) => ({
  now,
  messages: 0,
  aircraft: [{ hex: 'd00001', heard: {} }],
});

/** An aircraft flagged on the ground or not at 2 s, with an altitude sent at 1 s. */
const flagged = (value: boolean) => ({
  onGround: { value, heardMs: 2000n },
  baroAltitudeFt: { value: 25, heardMs: 1000n },
});

/** The aircraft of a frame, decoded. */
function aircraftOf(frame: ReturnType<typeof create<typeof FrameSchema>>): AircraftReport[] {
  const message = messageOf(frame);
  return message?.kind === 'snapshot' ? message.snapshot.aircraft : [];
}

describe('messageOf', () => {
  it("reads the tracker's pinned bytes as the aircraft they were made from", async () => {
    // Arrange: the snapshot at NOW, the reports a second before it
    const NOW = 1_700_000_000.5;
    const HEARD = NOW - 1;
    const frame = fromBinary(FrameSchema, await testdata('snapshot.bin').bytes());

    // Act
    const message = messageOf(frame);

    // Assert: one known in full, one on the ground placed by multilateration, one placed by
    // TIS-B and nothing else, and one known by its address only
    const everything: Heard = {
      flight: HEARD,
      category: HEARD,
      squawk: HEARD,
      emergency: HEARD,
      ident: HEARD,
      ra: HEARD,
      position: HEARD,
      nic: HEARD,
      rc: HEARD,
      alt: HEARD,
      gs: HEARD,
      track: HEARD,
      heading: HEARD,
      verticalRate: HEARD,
      roll: HEARD,
      trackRate: HEARD,
      ias: HEARD,
      tas: HEARD,
      mach: HEARD,
      selAlt: HEARD,
      fmsAlt: HEARD,
      selHeading: HEARD,
      navQnh: HEARD,
      navModes: HEARD,
      nacP: HEARD,
      windSpeed: HEARD,
      windDir: HEARD,
      oat: HEARD,
      tat: HEARD,
      messages: HEARD,
      rssi: HEARD,
    };
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
          threat: { altitude: 35000, range: 4.5, bearing: 117 },
        },
        position: { lat: 33.5, lon: 130.5 },
        alt: 35000,
        gs: 451.2,
        track: 182.9,
        heading: 176.1,
        verticalRate: -832,
        roll: -9.5,
        trackRate: -0.4,
        ias: 280,
        tas: 440,
        mach: 0.78,
        selAlt: 6000,
        fmsAlt: 5000,
        selHeading: 210.2,
        navQnh: 1013.6,
        navModes: ['autopilot', 'vnav', 'althold', 'approach', 'lnav', 'tcas'],
        nic: 8,
        rc: 186,
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
        heard: everything,
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
        nic: 0,
        messages: 2,
        heard: {
          category: HEARD,
          squawk: HEARD,
          emergency: HEARD,
          position: NOW,
          nic: NOW,
          alt: HEARD,
          navModes: HEARD,
          messages: NOW,
        },
      },
      {
        hex: 'd00003',
        position: { lat: 33, lon: 130 },
        source: 'tisb',
        alt: 0,
        nic: 6,
        rc: 926,
        heard: { position: HEARD, nic: HEARD, rc: HEARD, alt: HEARD },
      },
      { hex: 'd00004', heard: {} },
    ];
    const snapshot = { now: NOW, messages: 42, aircraft };
    expect(message).toStrictEqual({ kind: 'snapshot', snapshot });
  });

  it('takes the geometric vertical rate of an aircraft that reports no barometric one', () => {
    // Arrange: heard at 1 s and 2 s
    const rates = [
      {
        baroVerticalRateFpm: { value: -1200, heardMs: 1000n },
        geometricVerticalRateFpm: { value: -1100, heardMs: 2000n },
      },
      { geometricVerticalRateFpm: { value: 1856, heardMs: 2000n } },
      {},
    ];
    const frame = create(FrameSchema, {
      body: { case: 'snapshot', value: { aircraft: rates } },
    });

    // Act
    const read = aircraftOf(frame);

    // Assert: heard when the one taken was
    expect(read.map((a) => [a.verticalRate, a.heard.verticalRate])).toEqual([
      [-1200, 1],
      [1856, 2],
      [undefined, undefined],
    ]);
  });

  it('leaves the altitude unknown of an aircraft that reports only its GNSS height', () => {
    // Arrange
    const frame = create(FrameSchema, {
      body: { case: 'snapshot', value: { aircraft: [{ geometricAltitudeFt: { value: 4250 } }] } },
    });

    // Act
    const read = aircraftOf(frame);

    // Assert
    expect(read.map((a) => a.alt)).toEqual([undefined]);
  });

  it('puts an aircraft on the ground by its flag, whatever altitude it still sends', () => {
    // Arrange
    const frame = create(FrameSchema, {
      body: { case: 'snapshot', value: { aircraft: [flagged(true), flagged(false)] } },
    });

    // Act
    const read = aircraftOf(frame);

    // Assert: heard when the flag or the altitude was
    expect(read.map((a) => [a.alt, a.heard.alt])).toEqual([
      ['ground', 2],
      [25, 1],
    ]);
  });

  it('names the threat of an advisory by its address, the six hex digits', () => {
    // Arrange
    const advisory = { threat: { case: 'threatAddress' as const, value: 0x4840d6 } };
    const frame = create(FrameSchema, {
      body: { case: 'snapshot', value: { aircraft: [{ advisory }] } },
    });

    // Act
    const read = aircraftOf(frame);

    // Assert
    expect(read.map((a) => a.ra?.threat)).toEqual([{ address: '4840d6' }]);
  });

  it('reads a threat placed without any estimate as no threat', () => {
    // Arrange
    const advisory = { threat: { case: 'threatPosition' as const, value: {} } };
    const frame = create(FrameSchema, {
      body: { case: 'snapshot', value: { aircraft: [{ advisory }] } },
    });

    // Act
    const read = aircraftOf(frame);

    // Assert
    expect(read.map((a) => [a.ra !== undefined, a.ra?.threat])).toEqual([[true, undefined]]);
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

  it('reads the history a hello brings as snapshots in seconds, oldest first', () => {
    // Arrange
    const history = [8000n, 16_000n].map((nowMs) => ({
      nowMs,
      aircraft: [{ address: { value: 0xd00001 } }],
    }));
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

  it("reads the weather as the stations' reports", () => {
    // Arrange
    const qnh = [
      {
        station: 'RJTT',
        latDeg: 35.553,
        lonDeg: 139.781,
        observedMs: 1_790_074_800_000n,
        qnhInHg: 29.94,
      },
      {
        station: 'RJAA',
        latDeg: 35.765,
        lonDeg: 140.386,
        observedMs: 1_790_074_800_000n,
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
