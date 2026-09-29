import { decimalYear, magneticDeclination } from '../lib/wmm';
import {
  bumpSnapshot,
  setDeclination,
  setFeedStatus,
  setReceiverAnswered,
  setSite,
  site,
  type Site,
} from '../state/scope';
import { configureProjection, hasProjection, trackStore } from '../state/tracks';
import { type FeedPlaces, startFeed } from './facade';

export interface FeedOptions extends FeedPlaces {
  /** Where tar1090 serves readsb's traces, when it keeps them. */
  base: string;
  /** Overrides the receiver's own position. */
  siteOverride: Site | null;
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
    feedInfo: '/feed/info.json',
  };
}

function adoptSite(position: Site): void {
  configureProjection(position);
  setDeclination(magneticDeclination(position.lat, position.lon, 0, decimalYear(new Date())));
  setSite(position);
}

/** Time the page spends hidden is not counted against the feed. */
function noteShown(): void {
  if (document.visibilityState === 'visible') setFeedStatus((s) => ({ ...s, shownAt: Date.now() }));
}

/** Starts the feed worker and routes its events into the stores. */
export function connectFeed(opts: FeedOptions): () => void {
  if (opts.siteOverride) adoptSite(opts.siteOverride);

  const { base: _, siteOverride: __, ...places } = opts;
  const handle = startFeed(places, (e) => {
    switch (e.type) {
      case 'receiver':
        setReceiverAnswered(true);
        if (opts.siteOverride || e.receiver.lat === undefined || e.receiver.lon === undefined)
          break;
        // Every session greets with the receiver; only a new position is worth a reprojection.
        if (site()?.lat !== e.receiver.lat || site()?.lon !== e.receiver.lon) {
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
        setFeedStatus((s) => ({ ...s, lastAt: e.receivedAt, reason: null }));
        bumpSnapshot();
        break;
      case 'down':
        setFeedStatus((s) => ({ ...s, reason: e.reason }));
        break;
    }
  });

  document.addEventListener('visibilitychange', noteShown);

  return () => {
    document.removeEventListener('visibilitychange', noteShown);
    handle.stop();
  };
}
