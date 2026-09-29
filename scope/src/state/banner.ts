/** The banner text for a scope that cannot draw: the first blocker, in order of severity. */
import { deadReason, feedState } from './feedLine';
import type { FeedStatus, Site } from './scope';

export function bannerText(
  renderError: string | null,
  feed: FeedStatus,
  now: number,
  site: Site | null,
  receiverAnswered: boolean,
): string | null {
  if (renderError) return `NO SCOPE · ${renderError}`;
  if (feedState(feed, now) === 'dead') return `FEED DEAD · ${deadReason(feed)}`;
  if (!site && receiverAnswered)
    return 'SITE UNKNOWN · the receiver reports no position; add ?site=lat,lon';
  return null;
}
