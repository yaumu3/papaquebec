import { decimalYear, magneticDeclination } from '../lib/wmm';
import { markStale } from '../state/feedLine';
import {
  bumpSnapshot,
  feedStatus,
  setDeclination,
  setFeedStatus,
  setReceiverAnswered,
  setSite,
  type Site,
} from '../state/scope';
import { configureProjection, hasProjection, trackStore } from '../state/tracks';
import { startFeed } from './facade';

export interface FeedOptions {
  base: string;
  /** Overrides receiver.json. */
  siteOverride: Site | null;
  /** tar1090's chunk history. */
  historyBase: string;
}

function siteFromUrl(params: URLSearchParams): Site | null {
  const s = params.get('site')?.split(',').map(Number);
  return s && s.length === 2 && s.every(Number.isFinite)
    ? { lat: s[0] ?? 0, lon: s[1] ?? 0 }
    : null;
}

export function feedOptionsFromUrl(search: string): FeedOptions {
  const params = new URLSearchParams(search);
  return {
    base: '/data',
    siteOverride: siteFromUrl(params),
    historyBase: '/chunks',
  };
}

function adoptSite(site: Site): void {
  configureProjection(site);
  setDeclination(magneticDeclination(site.lat, site.lon, 0, decimalYear(new Date())));
  setSite(site);
}

/** Starts the feed worker and routes its events into the stores. */
export function connectFeed(opts: FeedOptions): () => void {
  if (opts.siteOverride) adoptSite(opts.siteOverride);

  const handle = startFeed(opts.base, opts.historyBase, (e) => {
    switch (e.type) {
      case 'receiver':
        setReceiverAnswered(true);
        if (!opts.siteOverride && e.receiver.lat !== undefined && e.receiver.lon !== undefined) {
          adoptSite({ lat: e.receiver.lat, lon: e.receiver.lon });
        }
        break;
      case 'backfill':
        if (!hasProjection()) return;
        for (const s of e.snapshots) trackStore.ingest(s);
        bumpSnapshot();
        break;
      case 'snapshot':
        if (!hasProjection()) return;
        trackStore.ingest(e.snapshot);
        setFeedStatus({ kind: 'rx', lastAt: e.receivedAt });
        bumpSnapshot();
        break;
      case 'error':
        setFeedStatus({ kind: 'dead', message: e.message, since: e.at });
        break;
    }
  });

  const staleTimer = setInterval(() => setFeedStatus(markStale(feedStatus(), Date.now())), 1000);

  return () => {
    clearInterval(staleTimer);
    handle.stop();
  };
}
