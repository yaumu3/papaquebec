import { describe, expect, it } from 'bun:test';

import { create, fromBinary, toBinary } from '@bufbuild/protobuf';
import { sizeDelimitedEncode } from '@bufbuild/protobuf/wire';

import type { FeedMessage } from './decode';
import { FrameSchema } from './gen/papaquebec/feed/v1/feed_pb';
import type { FetchLike } from './http';
import { type FeedDown, followFeed, type PushOptions, type Transport } from './push';

const testdata = (name: string) => Bun.file(`${import.meta.dir}/../../../proto/testdata/${name}`);

const HASH = 'ab'.repeat(32);
const ENDED: FeedDown = { kind: 'ended' };
const HELLO = toBinary(
  FrameSchema,
  create(FrameSchema, { body: { case: 'hello', value: { receiver: { latDeg: 1.5 } } } }),
);
const info: FetchLike = () => Promise.resolve(Response.json({ port: 4433, certificateHash: HASH }));

function streamOf<T>(items: T[]): ReadableStream<T> {
  return new ReadableStream({
    start(controller) {
      for (const item of items) controller.enqueue(item);
      controller.close();
    },
  });
}

/** The frames as the feeder writes them: each after its length, all run together. */
function wire(frames: Uint8Array[]): Uint8Array {
  const delimited = frames.map((f) => sizeDelimitedEncode(FrameSchema, fromBinary(FrameSchema, f)));
  return Uint8Array.from(delimited.flatMap((d) => Array.from(d)));
}

/** Chunks that cut across frames, as a network does. */
function chunked(bytes: Uint8Array): Uint8Array[] {
  const cut = Math.max(1, bytes.length / 3);
  return [bytes.slice(0, cut), bytes.slice(cut, 2 * cut), bytes.slice(2 * cut)];
}

/** A transport whose one stream carries the frames, then ends. */
function delivering(frames: Uint8Array[]): Transport {
  return {
    ready: Promise.resolve(),
    frames: streamOf([streamOf(chunked(wire(frames)))]),
    close: () => {},
  };
}

/** A transport that delivers the frames, then stays open and silent until it is closed. */
function fallingSilent(frames: Uint8Array[]): Transport {
  let open: ReadableStreamDefaultController<Uint8Array> | undefined;
  const one = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(wire(frames));
      open = controller;
    },
  });
  return {
    ready: Promise.resolve(),
    frames: streamOf([one]),
    close: () => open?.error(new Error('closed')),
  };
}

/** A transport the feeder refuses. */
function refused(): Transport {
  return { ready: Promise.reject(new Error('refused')), frames: streamOf([]), close: () => {} };
}

/** A transport that never becomes ready. */
function neverReady(): Transport {
  return { ready: new Promise(() => {}), frames: new ReadableStream(), close: () => {} };
}

/** A transport that delivers the frames and then hangs: closing it settles nothing. */
function hanging(frames: Uint8Array[]): Transport {
  const one = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(wire(frames));
    },
  });
  return { ready: Promise.resolve(), frames: streamOf([one]), close: () => {} };
}

interface Followed {
  messages: FeedMessage[];
  opened: { url: string; hash: Uint8Array }[];
  slept: number[];
  downs: FeedDown[];
}

/** Follows through `transports` in turn, stopping when a session asks for one more. */
async function follow(
  transports: (() => Transport)[],
  overrides: Partial<PushOptions> = {},
): Promise<Followed> {
  const followed: Followed = { messages: [], opened: [], slept: [], downs: [] };
  const { promise: done, resolve } = Promise.withResolvers<void>();
  const stop = followFeed({
    infoUrl: '/feed/info.json',
    host: 'scope.test',
    fetchFn: info,
    open: (url, hash) => {
      const next = transports.shift();
      if (!next) {
        stop();
        resolve();
        return {
          ready: Promise.reject(new Error('used up')),
          frames: streamOf([]),
          close: () => {},
        };
      }
      followed.opened.push({ url, hash });
      return next();
    },
    onMessage: (m) => followed.messages.push(m),
    onDown: (reason) => followed.downs.push(reason),
    sleep: (ms) => {
      followed.slept.push(ms);
      return Promise.resolve();
    },
    retryMs: 2000,
    deadlineMs: 60_000,
    since: () => 0,
    ...overrides,
  });
  await done;
  return followed;
}

describe('followFeed', () => {
  it('connects to the port and certificate the info names', async () => {
    // Arrange
    const transports = [() => delivering([])];

    // Act
    const followed = await follow(transports);

    // Assert
    expect(followed.opened).toEqual([
      { url: 'https://scope.test:4433/feed?since=0', hash: new Uint8Array(32).fill(0xab) },
    ]);
  });

  it('asks each session to resume after the last snapshot taken', async () => {
    // Arrange
    const taken = [0, 1700000000.5];
    const transports = [() => delivering([]), () => delivering([])];

    // Act
    const followed = await follow(transports, { since: () => taken.shift() ?? -1 });

    // Assert
    expect(followed.opened.map((o) => o.url)).toEqual([
      'https://scope.test:4433/feed?since=0',
      'https://scope.test:4433/feed?since=1700000000.5',
    ]);
  });

  it('hands over the hello, then each snapshot', async () => {
    // Arrange
    const frame = await testdata('snapshot.bin').bytes();
    const transports = [() => delivering([HELLO, frame, frame])];

    // Act
    const followed = await follow(transports);

    // Assert
    const handed = followed.messages.map((m) =>
      m.kind === 'hello' ? m.receiver.lat : m.snapshot.now,
    );
    expect(handed).toEqual([1.5, 1700000000.5, 1700000000.5]);
  });

  it('connects again after bytes it cannot read', async () => {
    // Arrange
    const frame = await testdata('snapshot.bin').bytes();
    const garbled: Transport = {
      ready: Promise.resolve(),
      frames: streamOf([streamOf([new Uint8Array([0x02, 0xff, 0xff])])]),
      close: () => {},
    };
    const transports = [() => garbled, () => delivering([frame])];

    // Act
    const followed = await follow(transports);

    // Assert
    expect(followed.opened).toHaveLength(2);
    expect(followed.messages).toHaveLength(1);
    expect(followed.downs[0]?.kind).toBe('failed');
  });

  it('connects again after the transport ends or fails', async () => {
    // Arrange
    const frame = await testdata('snapshot.bin').bytes();
    const transports = [() => delivering([frame]), refused, () => delivering([frame])];

    // Act
    const followed = await follow(transports);

    // Assert
    expect(followed.opened).toHaveLength(3);
    expect(followed.slept).toEqual([2000]);
    expect(followed.messages).toHaveLength(2);
    expect(followed.downs).toEqual([ENDED, { kind: 'failed', message: 'refused' }, ENDED]);
  });

  it('connects again at once after a session that delivered', async () => {
    // Arrange
    const frame = await testdata('snapshot.bin').bytes();
    const transports = [() => delivering([frame]), () => delivering([frame])];

    // Act
    const followed = await follow(transports);

    // Assert
    expect(followed.opened).toHaveLength(2);
    expect(followed.slept).toEqual([]);
  });

  it('gives up on a session that falls silent and connects again', async () => {
    // Arrange
    const frame = await testdata('snapshot.bin').bytes();
    const transports = [() => fallingSilent([frame]), () => delivering([frame])];

    // Act
    const followed = await follow(transports, { deadlineMs: 20 });

    // Assert
    expect(followed.opened).toHaveLength(2);
    expect(followed.messages).toHaveLength(2);
    expect(followed.downs).toEqual([{ kind: 'late', wait: 'frame', ms: 20 }, ENDED]);
  });

  it('gives up on a silent session even when closing it settles nothing', async () => {
    // Arrange
    const frame = await testdata('snapshot.bin').bytes();
    const transports = [() => hanging([frame]), () => delivering([frame])];

    // Act
    const followed = await follow(transports, { deadlineMs: 20 });

    // Assert
    expect(followed.opened).toHaveLength(2);
    expect(followed.messages).toHaveLength(2);
    expect(followed.downs).toEqual([{ kind: 'late', wait: 'frame', ms: 20 }, ENDED]);
  });

  it('gives up on a session that never becomes ready', async () => {
    // Arrange
    const frame = await testdata('snapshot.bin').bytes();
    const transports = [neverReady, () => delivering([frame])];

    // Act
    const followed = await follow(transports, { deadlineMs: 20 });

    // Assert
    expect(followed.opened).toHaveLength(2);
    expect(followed.downs[0]).toEqual({ kind: 'late', wait: 'connecting', ms: 20 });
  });

  it('waits and asks again when the info cannot be read', async () => {
    // Arrange
    const answers = [new Response('gone', { status: 404 }), Response.json({ port: 'x' })];
    const fetchFn: FetchLike = () =>
      Promise.resolve(answers.shift() ?? Response.json({ port: 4433, certificateHash: HASH }));
    const transports = [() => delivering([])];

    // Act
    const followed = await follow(transports, { fetchFn });

    // Assert
    expect(followed.opened).toHaveLength(1);
    expect(followed.slept).toEqual([2000, 2000, 2000]);
    expect(followed.downs.slice(0, 2)).toEqual([
      { kind: 'failed', message: '/feed/info.json: HTTP 404' },
      { kind: 'failed', message: 'feed info: unexpected shape' },
    ]);
  });

  it('closes the transport when stopped', async () => {
    // Arrange
    const { promise: closed, resolve: close } = Promise.withResolvers<string>();
    const open = (): Transport => ({
      ready: Promise.resolve(),
      frames: new ReadableStream(),
      close: () => close('closed'),
    });
    const stop = followFeed({
      infoUrl: '/feed/info.json',
      host: 'scope.test',
      fetchFn: info,
      open,
      onMessage: () => {},
      onDown: () => {},
      sleep: () => Promise.resolve(),
      retryMs: 2000,
      deadlineMs: 60_000,
      since: () => 0,
    });
    await new Promise((r) => setTimeout(r, 10));

    // Act
    stop();

    // Assert
    expect(await Promise.race([closed, Promise.resolve('open')])).toBe('closed');
  });
});
