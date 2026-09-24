import { describe, expect, it } from 'bun:test';

import { STANDARD_ALTIMETER } from '../lib/altitude';
import { altitudeUnfiltered, classify, type Filter, FL_MAX, FL_MIN } from './filter';

const base: Filter = { ground: true, lowerFl: 0, upperFl: FL_MAX, squawk: 'all' };

describe('classify', () => {
  it('shows a target of unknown altitude only while no band is set', () => {
    // Arrange
    const t = { alt: undefined, squawk: '2000', emergency: undefined };

    // Act
    const full = classify(t, base, STANDARD_ALTIMETER);
    const banded = classify(t, { ...base, upperFl: 200 }, STANDARD_ALTIMETER);

    // Assert
    expect(full).toBe('shown');
    expect(banded).toBe('filtered');
  });

  it('shows airborne tracks inside the altitude band and marks those outside as filtered', () => {
    // Arrange
    const filter: Filter = { ...base, lowerFl: 50, upperFl: 200 };
    const alts: (number | undefined)[] = [10000, 4900, 20100, undefined];

    // Act
    const results = alts.map((alt) =>
      classify({ alt, squawk: '2000', emergency: undefined }, filter, STANDARD_ALTIMETER),
    );

    // Assert
    expect(results).toEqual(['shown', 'filtered', 'filtered', 'filtered']);
  });

  it('shows ground traffic by its own switch, whatever the band', () => {
    // Arrange
    const t = { alt: 'ground' as const, squawk: '2000', emergency: undefined };
    const filters: Filter[] = [
      { ...base, lowerFl: 50 },
      { ...base, ground: false },
      { ...base, ground: false, lowerFl: 50 },
    ];

    // Act
    const results = filters.map((f) => classify(t, f, STANDARD_ALTIMETER));

    // Assert
    expect(results).toEqual(['shown', 'filtered', 'filtered']);
  });

  it('switches ground traffic off without touching airborne or unknown altitudes', () => {
    // Arrange
    const filter: Filter = { ...base, ground: false };
    const alts: (number | undefined)[] = [0, 3000, undefined];

    // Act
    const results = alts.map((alt) =>
      classify({ alt, squawk: '2000', emergency: undefined }, filter, STANDARD_ALTIMETER),
    );

    // Assert
    expect(results).toEqual(['shown', 'shown', 'shown']);
  });

  it('hides VFR squawks under NON-VFR and everything but emergencies under EMERG', () => {
    // Arrange
    const targets = [
      { alt: 3000, squawk: '1200', emergency: undefined },
      { alt: 3000, squawk: '2431', emergency: undefined },
      { alt: 3000, squawk: '7700', emergency: undefined },
    ];

    // Act
    const nonVfr = targets.map((t) =>
      classify(t, { ...base, squawk: 'nonvfr' }, STANDARD_ALTIMETER),
    );
    const emerg = targets.map((t) =>
      classify(t, { ...base, squawk: 'emergency' }, STANDARD_ALTIMETER),
    );

    // Assert
    expect(nonVfr).toEqual(['filtered', 'shown', 'shown']);
    expect(emerg).toEqual(['filtered', 'filtered', 'shown']);
  });

  it('never filters an emergency, whatever the band', () => {
    // Arrange
    const filter: Filter = { ground: false, lowerFl: 100, upperFl: 200, squawk: 'nonvfr' };

    // Act
    const r = classify(
      { alt: 500, squawk: '1200', emergency: 'general' },
      filter,
      STANDARD_ALTIMETER,
    );

    // Assert
    expect(r).toBe('shown');
  });
});

describe('classify with a local altimeter', () => {
  it('bands on the altitude the data block shows, not raw pressure altitude', () => {
    // Arrange
    const filter: Filter = { ...base, lowerFl: 50, upperFl: 240 };
    const high = { transitionAltFt: 14000, qnhInHg: 30.92 }; // about +920 ft on the block
    const alts = [4600, 4000, 24500]; // blocks read 055, 049, FL245

    // Act
    const results = alts.map((alt) =>
      classify({ alt, squawk: '2000', emergency: undefined }, filter, high),
    );

    // Assert
    expect(results).toEqual(['shown', 'filtered', 'filtered']);
  });
});

describe('classify at the stops', () => {
  it('treats an edge at its stop as open, whatever the block shows beyond it', () => {
    // Arrange
    const filter: Filter = { ...base, lowerFl: FL_MIN, upperFl: FL_MAX };
    const low = { transitionAltFt: 14000, qnhInHg: 28.5 }; // blocks read below 000 near sea level
    const targets = [
      { alt: 65000, squawk: '2000', emergency: undefined },
      { alt: 100, squawk: '2000', emergency: undefined },
    ];

    // Act
    const results = targets.map((t) => classify(t, filter, low));

    // Assert
    expect(results).toEqual(['shown', 'shown']);
  });
});

describe('altitudeUnfiltered', () => {
  it('is true only with ground shown and both edges at their stops', () => {
    // Arrange
    const filters: Filter[] = [
      base,
      { ...base, ground: false },
      { ...base, lowerFl: 10 },
      { ...base, upperFl: FL_MAX - 10 },
      { ...base, squawk: 'nonvfr' },
    ];

    // Act
    const out = filters.map(altitudeUnfiltered);

    // Assert
    expect(out).toEqual([true, false, false, false, true]);
  });
});
