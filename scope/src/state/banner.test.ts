import { describe, expect, it } from 'bun:test';

import { bannerText } from './banner';

const site = { lat: 35.5533, lon: 139.7811 }; // RJTT

describe('bannerText', () => {
  it('names the first thing that stops the scope from drawing, or nothing', () => {
    // Arrange
    const cases = [
      { render: 'no adapter', feed: { kind: 'rx', lastAt: 1 }, site, answered: true },
      { render: null, feed: { kind: 'dead', message: 'HTTP 502', since: 1 }, site, answered: true },
      { render: null, feed: { kind: 'connecting' }, site: null, answered: true },
      { render: null, feed: { kind: 'rx', lastAt: 1 }, site, answered: true },
    ] as const;

    // Act
    const out = cases.map((c) => bannerText(c.render, c.feed, c.site, c.answered));

    // Assert
    expect(out).toEqual([
      'NO SCOPE · no adapter',
      'FEED DEAD · HTTP 502',
      'SITE UNKNOWN · receiver.json has no lat/lon; add ?site=lat,lon',
      null,
    ]);
  });

  it('does not call the site unknown before receiver.json has answered', () => {
    // Arrange
    const feed = { kind: 'connecting' } as const;

    // Act
    const out = bannerText(null, feed, null, false);

    // Assert
    expect(out).toBeNull();
  });
});
