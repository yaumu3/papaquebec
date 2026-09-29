import { describe, expect, it } from 'bun:test';

import { create, fromBinary } from '@bufbuild/protobuf';

import type { AircraftSnapshot } from '../lib/aircraft';
import { messageOf } from './decode';
import { FrameSchema } from './gen/papaquebec/feed/v1/feed_pb';

const testdata = (name: string) => Bun.file(`${import.meta.dir}/../../../proto/testdata/${name}`);

const snapshotAt = (now: number) => ({ now, messages: 0, aircraft: [{ hex: 'd00001' }] });

describe('messageOf', () => {
  it("gives back the aircraft.json the feeder's bytes were made from", async () => {
    // Arrange
    const document: AircraftSnapshot = await testdata('snapshot.json').json();
    const frame = fromBinary(FrameSchema, await testdata('snapshot.bin').bytes());

    // Act
    const message = messageOf(frame);

    // Assert
    expect(message).toStrictEqual({ kind: 'snapshot', snapshot: document });
  });

  it('refuses a frame that carries nothing', () => {
    // Arrange
    const frame = create(FrameSchema);

    // Act
    const read = () => messageOf(frame);

    // Assert
    expect(read).toThrow(/empty/);
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
});
