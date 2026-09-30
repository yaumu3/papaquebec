import { describe, expect, it } from 'bun:test';

import { resolveSite } from './site';

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
    const out = given.map(([args, env]) => {
      try {
        return resolveSite(args, env);
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    });

    // Assert
    expect(out).toEqual([
      'no site: set PQ_SITE to lat,lon',
      'not a position: north east',
      'not a position: 35.6 ',
    ]);
  });
});
