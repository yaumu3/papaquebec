import type { AircraftSnapshot, ReceiverJson } from '../lib/aircraft';

/** One way of obtaining `aircraft.json` snapshots. The worker polls it. */
export interface FeedSource {
  /** Resolves with the next full snapshot; rejects when the feed is dead. */
  poll(): Promise<AircraftSnapshot>;
  receiver(): Promise<ReceiverJson>;
}

/** The slice of `fetch` the sources use; narrow so tests can stub it. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
