import { describe, expect, it } from 'bun:test';

import { aeroJsonSchema } from './schema';

describe('aeroJsonSchema', () => {
  it('describes a titled file whose lists may be omitted', () => {
    // Arrange
    const lists = ['waypoints', 'navaids', 'airways', 'airspace', 'sectors', 'airports'];

    // Act
    const schema = aeroJsonSchema();

    // Assert
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.title).toBe('papaquebec aero.json');
    expect(schema.required).toEqual(['title']);
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining([...lists, 'title', 'note', 'fetched']),
    );
    expect(schema.properties.title).toMatchObject({
      description: expect.stringMatching(/Maps panel/),
    });
  });
});
