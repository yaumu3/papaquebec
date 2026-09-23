/** The banner text for a scope that cannot draw: the first blocker, in order of severity. */
import type { FeedStatus, Site } from './scope';

export function bannerText(
  renderError: string | null,
  feed: FeedStatus,
  site: Site | null,
  receiverAnswered: boolean,
): string | null {
  if (renderError) return `NO SCOPE · ${renderError}`;
  if (feed.kind === 'dead') return `FEED DEAD · ${feed.message}`;
  if (!site && receiverAnswered)
    return 'SITE UNKNOWN · receiver.json has no lat/lon; add ?site=lat,lon';
  return null;
}
