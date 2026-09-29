import { sizeDelimitedDecodeStream } from '@bufbuild/protobuf/wire';

import { isRecord } from '../lib/guards';
import { type FeedMessage, messageOf } from './decode';
import { FrameSchema } from './gen/papaquebec/feed/v1/feed_pb';
import { type FetchLike, getJson } from './http';

/** A wait on a session, each under its own deadline. */
export type Wait = 'info' | 'connecting' | 'stream' | 'frame';

/** Why the feed is down. */
export type FeedDown =
  /** The feeder ended the session. */
  | { kind: 'ended' }
  /** A wait ran past its deadline. */
  | { kind: 'late'; wait: Wait; ms: number }
  /** Anything else went wrong, as the platform words it. */
  | { kind: 'failed'; message: string }
  /** The browser cannot open a session at all. */
  | { kind: 'unsupported' };

/** The slice of `WebTransport` the feed uses; narrow so tests can stand in for it. */
export interface Transport {
  ready: Promise<unknown>;
  /** The feeder opens one stream per session and writes every frame on it, each after its length. */
  frames: ReadableStream<ReadableStream<Uint8Array>>;
  close(): void;
}

export interface PushOptions {
  /** Where the feeder publishes its port and certificate. */
  infoUrl: string;
  /** The feeder answers on the host that serves the scope. */
  host: string;
  fetchFn: FetchLike;
  open: (url: string, certificateHash: Uint8Array<ArrayBuffer>) => Transport;
  onMessage: (message: FeedMessage) => void;
  /** Told why each time a session fails or ends. */
  onDown: (reason: FeedDown) => void;
  sleep: (ms: number) => Promise<void>;
  /** The wait before connecting again. */
  retryMs: number;
  /** The snapshot time a new session resumes after, in Unix seconds. */
  since: () => number;
  /**
   * How long any one wait on a session may take: for the info, for connecting, for
   * each read. After a suspended page wakes, some of them never end.
   */
  deadlineMs: number;
}

interface Info {
  port: number;
  certificateHash: Uint8Array<ArrayBuffer>;
}

function parseInfo(raw: unknown): Info {
  if (
    isRecord(raw) &&
    typeof raw.port === 'number' &&
    typeof raw.certificateHash === 'string' &&
    /^[0-9a-f]{64}$/.test(raw.certificateHash)
  ) {
    const bytes = raw.certificateHash.match(/../g) ?? [];
    return { port: raw.port, certificateHash: Uint8Array.from(bytes, (b) => parseInt(b, 16)) };
  }
  throw new Error('feed info: unexpected shape');
}

class Late extends Error {
  constructor(
    readonly wait: Wait,
    readonly ms: number,
  ) {
    super(`${wait} took longer than ${ms} ms`);
  }
}

/** Settles as `promise` does, or fails with `Late` once `ms` pass first. */
function within<T>(promise: Promise<T>, ms: number, wait: Wait): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Late(wait, ms)), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** The stream's chunks, read with a reader as Safari cannot iterate a stream, each within `ms`. */
function chunksOf(stream: ReadableStream<Uint8Array>, ms: number): AsyncIterable<Uint8Array> {
  const reader = stream.getReader();
  const next = async (): Promise<IteratorResult<Uint8Array>> => {
    const read = await within(reader.read(), ms, 'frame');
    return read.done ? { done: true, value: undefined } : read;
  };
  return { [Symbol.asyncIterator]: () => ({ next }) };
}

function downOf(err: unknown): FeedDown {
  if (err instanceof Late) return { kind: 'late', wait: err.wait, ms: err.ms };
  return { kind: 'failed', message: err instanceof Error ? err.message : String(err) };
}

/**
 * Keeps a session with the feeder open and hands over its hello and each snapshot,
 * connecting again whenever the session ends or a wait on it runs out. Once a wait
 * has run out the session is left behind, never waited on again. Connecting again
 * is immediate after a session that delivered, and after a pause otherwise.
 * Returns how to stop.
 */
export function followFeed(o: PushOptions): () => void {
  let stopped = false;
  let transport: Transport | undefined;
  let delivered = false;
  const session = async () => {
    const info = parseInfo(await within(getJson(o.fetchFn, o.infoUrl), o.deadlineMs, 'info'));
    const url = `https://${o.host}:${info.port}/feed?since=${o.since()}`;
    transport = o.open(url, info.certificateHash);
    await within(transport.ready, o.deadlineMs, 'connecting');
    const streams = transport.frames.getReader();
    const { value: stream } = await within(streams.read(), o.deadlineMs, 'stream');
    if (!stream) return;
    const frames = sizeDelimitedDecodeStream(FrameSchema, chunksOf(stream, o.deadlineMs));
    for await (const frame of frames) {
      if (stopped) return;
      delivered = true;
      o.onMessage(messageOf(frame));
    }
  };
  /** One session, then the next, each run started afresh so none waits on the last. */
  const run = async () => {
    delivered = false;
    const down = await session().then((): FeedDown => ({ kind: 'ended' }), downOf);
    transport?.close();
    if (stopped) return;
    o.onDown(down);
    if (!delivered) await o.sleep(o.retryMs);
    if (!stopped) void run();
  };
  void run();
  return () => {
    stopped = true;
    transport?.close();
  };
}

/** Opens a session that trusts the feeder's certificate by its hash. */
export function openWebTransport(url: string, certificateHash: Uint8Array<ArrayBuffer>): Transport {
  const transport = new WebTransport(url, {
    serverCertificateHashes: [{ algorithm: 'sha-256', value: certificateHash }],
  });
  return {
    ready: transport.ready,
    frames: transport.incomingUnidirectionalStreams,
    close: () => transport.close(),
  };
}
