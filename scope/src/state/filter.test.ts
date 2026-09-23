import { describe, expect, it } from 'bun:test';

import { classify, type Filter } from './filter';

const base: Filter = { lowerFl: 0, upperFl: 600, squawk: 'all' };

describe('classify', () => {
  it('shows a target of unknown altitude only while no band is set', () => {
    // Arrange
    const t = { alt: undefined, squawk: '2000', emergency: undefined };

    // Act
    const full = classify(t, base);
    const banded = classify(t, { ...base, upperFl: 200 });

    // Assert
    expect(full).toBe('shown');
    expect(banded).toBe('filtered');
  });

  it('shows tracks inside the altitude band and marks those outside as filtered', () => {
    // Arrange
    const filter: Filter = { ...base, lowerFl: 50, upperFl: 200 };
    const alts: (number | 'ground' | undefined)[] = [10000, 4900, 20100, 'ground', undefined];

    // Act
    const results = alts.map((alt) =>
      classify({ alt, squawk: '2000', emergency: undefined }, filter),
    );

    // Assert
    expect(results).toEqual(['shown', 'filtered', 'filtered', 'filtered', 'filtered']);
  });

  it('hides VFR squawks under NON-VFR and everything but emergencies under EMERG', () => {
    // Arrange
    const targets = [
      { alt: 3000, squawk: '1200', emergency: undefined },
      { alt: 3000, squawk: '2431', emergency: undefined },
      { alt: 3000, squawk: '7700', emergency: undefined },
    ];

    // Act
    const nonVfr = targets.map((t) => classify(t, { ...base, squawk: 'nonvfr' }));
    const emerg = targets.map((t) => classify(t, { ...base, squawk: 'emergency' }));

    // Assert
    expect(nonVfr).toEqual(['filtered', 'shown', 'shown']);
    expect(emerg).toEqual(['filtered', 'filtered', 'shown']);
  });

  it('never filters an emergency, whatever the band', () => {
    // Arrange
    const filter: Filter = { lowerFl: 100, upperFl: 200, squawk: 'nonvfr' };

    // Act
    const r = classify({ alt: 500, squawk: '1200', emergency: 'general' }, filter);

    // Assert
    expect(r).toBe('shown');
  });
});
