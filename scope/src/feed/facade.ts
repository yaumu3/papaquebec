import type { FeedCommand, FeedEvent } from './worker';

export interface FeedHandle {
  stop(): void;
}

/** Runs a feed source in its own worker and hands events to the caller. */
export function startFeed(
  base: string,
  historyBase: string,
  onEvent: (e: FeedEvent) => void,
): FeedHandle {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (e: MessageEvent<FeedEvent>) => onEvent(e.data));
  const cmd: FeedCommand = { type: 'start', base, historyBase };
  worker.postMessage(cmd);
  return { stop: () => worker.terminate() };
}
