import { describe, expect, it } from 'bun:test';

import Ajv2020 from 'ajv/dist/2020';
import draft07 from 'ajv/dist/refs/json-schema-draft-07.json';

import Feature from '../../schema/geojson/Feature.json';
import FeatureCollection from '../../schema/geojson/FeatureCollection.json';
import LineString from '../../schema/geojson/LineString.json';
import Point from '../../schema/geojson/Point.json';
import Polygon from '../../schema/geojson/Polygon.json';
import schema from '../../schema/mapset.schema.json';
import { validateMapSet } from './mapset';
import { CORPUS } from './mapsetCorpus';
import {
  AD_LENGTH,
  CALLSIGN_MAX,
  EFFECTIVE_PATTERN,
  FREQ_PATTERN,
  ID_MAX,
  KIND_MAX,
  LAYERS,
  LIMIT_PATTERN,
  MAPSET_VERSION,
  NAME_MAX,
  NOTE_MAX,
  SET_ID_PATTERN,
  TITLE_MAX,
} from './mapsetFormat';

/** An ajv with the draft-07 meta-schema and the vendored GeoJSON schemas registered by `$id`. */
function mapSetValidator() {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  ajv.addMetaSchema(draft07);
  for (const vendored of [FeatureCollection, Feature, Point, LineString, Polygon]) {
    ajv.addSchema(vendored);
  }
  return ajv.compile(schema);
}

/** What `schema` holds at `path`, or undefined. */
function at(path: (string | number)[], from: unknown = schema): unknown {
  return path.reduce<unknown>(
    (node, key) => (typeof node === 'object' && node !== null ? Reflect.get(node, key) : undefined),
    from,
  );
}

const AREA = ['$defs', 'areaFeature', 'properties', 'properties', 'properties'];
const POINT = ['$defs', 'pointFeature', 'properties', 'properties', 'properties'];
const ROOT = ['allOf', 1, 'properties'];

describe('mapset.schema.json', () => {
  it('agrees with the constants the parser is written from', () => {
    // Arrange
    const table: { name: string; constant: unknown; path: (string | number)[] }[] = [
      { name: 'layers', constant: LAYERS, path: ['$defs', 'layer', 'enum'] },
      { name: 'version', constant: MAPSET_VERSION, path: [...ROOT, 'version', 'const'] },
      { name: 'limit', constant: LIMIT_PATTERN.source, path: ['$defs', 'limit', 'pattern'] },
      {
        name: 'frequency',
        constant: FREQ_PATTERN.source,
        path: [...AREA, 'freqs', 'items', 'pattern'],
      },
      { name: 'set id', constant: SET_ID_PATTERN.source, path: [...ROOT, 'id', 'pattern'] },
      {
        name: 'effective',
        constant: EFFECTIVE_PATTERN.source,
        path: [...ROOT, 'effective', 'pattern'],
      },
      { name: 'name length', constant: NAME_MAX, path: ['$defs', 'name', 'maxLength'] },
      { name: 'kind length', constant: KIND_MAX, path: ['$defs', 'kind', 'maxLength'] },
      { name: 'title length', constant: TITLE_MAX, path: [...ROOT, 'title', 'maxLength'] },
      { name: 'note length', constant: NOTE_MAX, path: [...ROOT, 'note', 'maxLength'] },
      { name: 'callsign length', constant: CALLSIGN_MAX, path: [...AREA, 'callsign', 'maxLength'] },
      { name: 'point id length', constant: ID_MAX, path: [...POINT, 'id', 'maxLength'] },
      { name: 'aerodrome length', constant: AD_LENGTH, path: [...POINT, 'ad', 'maxLength'] },
    ];

    // Act
    const published = table.map(({ name, path }) => [name, at(path)]);

    // Assert
    expect(published).toEqual(table.map(({ name, constant }) => [name, constant]));
  });

  it('gives the same verdict as the strict parse on every document of the corpus', () => {
    // Arrange
    const validate = mapSetValidator();

    // Act
    const verdicts = CORPUS.map(({ name, document }) => ({
      name,
      schema: validate(document),
      parse: validateMapSet(document).ok,
    }));

    // Assert
    expect(verdicts).toEqual(
      CORPUS.map(({ name, valid }) => ({ name, schema: valid, parse: valid })),
    );
  });
});
