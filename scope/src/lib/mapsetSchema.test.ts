import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import Ajv2020 from 'ajv/dist/2020';
import draft07 from 'ajv/dist/refs/json-schema-draft-07.json';

import Feature from '../../schema/geojson/Feature.json';
import FeatureCollection from '../../schema/geojson/FeatureCollection.json';
import LineString from '../../schema/geojson/LineString.json';
import Point from '../../schema/geojson/Point.json';
import Polygon from '../../schema/geojson/Polygon.json';
import schema from '../../schema/mapset.schema.json';

const example: unknown = JSON.parse(
  readFileSync(new URL('../../schema/example.mapset.geojson', import.meta.url), 'utf8'),
);

/** An ajv with the draft-07 meta-schema and the vendored GeoJSON schemas registered by `$id`. */
function mapSetValidator() {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  ajv.addMetaSchema(draft07);
  for (const vendored of [FeatureCollection, Feature, Point, LineString, Polygon]) {
    ajv.addSchema(vendored);
  }
  return ajv.compile(schema);
}

describe('mapset.schema.json', () => {
  it('accepts the example map set', () => {
    // Arrange
    const validate = mapSetValidator();

    // Act
    const valid = validate(example);

    // Assert
    expect(valid).toBe(true);
    expect(validate.errors).toBeNull();
  });
});
