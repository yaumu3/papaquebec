import { describe, expect, it } from 'bun:test';

import { CREDITS, SOFTWARE } from './credits';

describe('CREDITS', () => {
  it('names where each kind of data the scope shows comes from, with a place to read more', () => {
    // Arrange
    const shown = ['REGISTRY', 'AIRSPACE', 'COASTLINE', 'QNH', 'TYPEFACE'];

    // Act
    const credited = CREDITS.map((credit) => credit.subject);

    // Assert
    expect(credited).toEqual(shown);
    expect([SOFTWARE, ...CREDITS].map((credit) => credit.url)).toSatisfy((urls: string[]) =>
      urls.every((url) => url.startsWith('https://')),
    );
  });

  it('points the registry at the repository Mictronics publishes the database in', () => {
    // Arrange
    const repository = 'https://github.com/Mictronics/aircraft-database';

    // Act
    const registry = CREDITS.find((credit) => credit.subject === 'REGISTRY');

    // Assert
    expect(registry?.url).toBe(repository);
  });
});
