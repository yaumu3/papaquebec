import { describe, expect, it } from 'bun:test';

import { resolveSite } from './site';

/** The site resolved, or what it is refused with. */
function resolved(args: string[], env: Record<string, string>) {
  try {
    return resolveSite(args, env);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

describe('resolveSite', () => {
  it('takes lat and lon from the arguments when both are given', () => {
    // Arrange
    const env = { PQ_SITE: '35.6,140.0' }; // Chiba

    // Act
    const out = resolveSite(['35.765', '140.386'], env); // RJAA

    // Assert
    expect(out).toEqual({ lat: 35.765, lon: 140.386 });
  });

  it('otherwise takes the site from PQ_SITE', () => {
    // Arrange
    const env = { PQ_SITE: '35.6,140.0' }; // Chiba

    // Act
    const out = resolveSite([], env);

    // Assert
    expect(out).toEqual({ lat: 35.6, lon: 140.0 });
  });

  it('refuses what is not a position, and says where a site is to be given when none is', () => {
    // Arrange
    const given: [string[], Record<string, string>][] = [
      [[], {}],
      [['north', 'east'], {}],
      [[], { PQ_SITE: '35.6' }],
    ];

    // Act
    const out = given.map(([args, env]) => resolved(args, env));

    // Assert
    expect(out).toEqual([
      'no site: set PQ_SITE to lat,lon',
      'not a position: north east',
      'not a position: 35.6 ',
    ]);
  });

  it('takes a site up to the poles and the antimeridian, and refuses one beyond', () => {
    // Arrange
    const given: [string[], Record<string, string>][] = [
      [['-90', '180'], {}],
      [['91', '140'], {}],
      [[], { PQ_SITE: '35.6,-181' }],
    ];

    // Act
    const out = given.map(([args, env]) => resolved(args, env));

    // Assert
    expect(out).toEqual([
      { lat: -90, lon: 180 },
      'outside the globe: 91 140',
      'outside the globe: 35.6 -181',
    ]);
  });
});
