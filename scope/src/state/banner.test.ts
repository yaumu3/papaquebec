import { describe, expect, it } from 'bun:test';

import { bannerText } from './banner';

const site = { lat: 35.5533, lon: 139.7811 }; // RJTT
const receiving = { lastAt: 100_000, shownAt: 0, reason: null };
const connecting = { lastAt: null, shownAt: 100_000, reason: null };
const dead = { lastAt: 1, shownAt: 0, reason: { kind: 'failed', message: 'HTTP 502' } } as const;
const NOW = 100_000;

describe('bannerText', () => {
  it('names the first thing that stops the scope from drawing, or nothing', () => {
    // Arrange
    const cases = [
      { render: 'no adapter', feed: receiving, site, answered: true },
      { render: null, feed: dead, site, answered: true },
      { render: null, feed: connecting, site: null, answered: true },
      { render: null, feed: receiving, site, answered: true },
    ];

    // Act
    const out = cases.map((c) => bannerText(c.render, c.feed, NOW, c.site, c.answered));

    // Assert
    expect(out).toEqual([
      'NO SCOPE · no adapter',
      'FEED DEAD · HTTP 502',
      'SITE UNKNOWN · the receiver reports no position; add ?site=lat,lon',
      null,
    ]);
  });

  it('does not call the site unknown before the receiver has answered', () => {
    // Arrange
    const feed = connecting;

    // Act
    const out = bannerText(null, feed, NOW, null, false);

    // Assert
    expect(out).toBeNull();
  });
});
