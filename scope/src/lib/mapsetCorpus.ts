import { readFileSync } from 'node:fs';

/** Bun imports a `.geojson` as a path, so the contract's example is read as text. */
export const EXAMPLE: MapSetDocument = JSON.parse(
  readFileSync(new URL('../../schema/example.mapset.geojson', import.meta.url), 'utf8'),
);

interface MapSetDocument {
  features: { properties: Record<string, unknown> | null; geometry: Record<string, unknown> }[];
  [member: string]: unknown;
}

/** A copy of the example with one named Feature or member changed, and the verdict it earns. */
export interface CorpusCase {
  name: string;
  document: unknown;
  valid: boolean;
  /** Where a strict parse's message starts, for an invalid document. */
  at?: string;
}

/** The index of the example's first Feature on `layer`. */
export const indexOf = (layer: string): number => {
  const at = EXAMPLE.features.findIndex((f) => f.properties?.layer === layer);
  if (at < 0) throw new Error(`the example has no ${layer} Feature`);
  return at;
};

function variant(change: (copy: MapSetDocument) => void): MapSetDocument {
  const copy = structuredClone(EXAMPLE);
  change(copy);
  return copy;
}

const feature = (copy: MapSetDocument, layer: string) => {
  const found = copy.features[indexOf(layer)];
  if (!found) throw new Error(`the example has no ${layer} Feature`);
  return found;
};

const properties = (copy: MapSetDocument, layer: string) => {
  const found = feature(copy, layer).properties;
  if (!found) throw new Error(`the ${layer} Feature has no properties`);
  return found;
};

const broken = (name: string, layer: string, tail: string, change: (c: MapSetDocument) => void) =>
  ({
    name,
    document: variant(change),
    valid: false,
    at: `features[${indexOf(layer)}].${tail}`,
  }) satisfies CorpusCase;

const benign = (name: string, change: (c: MapSetDocument) => void) =>
  ({ name, document: variant(change), valid: true }) satisfies CorpusCase;

export const CORPUS: CorpusCase[] = [
  { name: 'the example', document: EXAMPLE, valid: true },
  benign('a Feature with a bbox and an id', (c) => {
    Object.assign(c.features[0] ?? {}, { id: 'a-feature', bbox: [0, 0, 1, 1] });
  }),
  benign('a $schema at the root', (c) => {
    c.$schema = 'https://example.org/mapset.schema.json';
  }),
  benign('a foreign member on the collection', (c) => {
    c.generator = 'a converter';
  }),
  broken('an unknown layer', 'fix', 'properties.layer', (c) => {
    properties(c, 'fix').layer = 'xyz';
  }),
  broken('a 3-D coordinate', 'ad', 'geometry.coordinates', (c) => {
    const position = feature(c, 'ad').geometry.coordinates;
    if (Array.isArray(position)) position.push(25);
  }),
  broken('a numeric limit', 'ctr', 'properties.lower', (c) => {
    properties(c, 'ctr').lower = 3000;
  }),
  broken('a route drawn as a Polygon', 'conv', 'geometry', (c) => {
    feature(c, 'conv').geometry = {
      type: 'Polygon',
      coordinates: [
        [
          [130, 33],
          [131, 33],
          [131, 34],
          [130, 33],
        ],
      ],
    };
  }),
  broken('a ring of three positions', 'tma', 'geometry.coordinates[0]', (c) => {
    const rings = feature(c, 'tma').geometry.coordinates;
    if (Array.isArray(rings)) rings[0]?.splice(3);
  }),
  broken('a hold without an inbound track', 'hold', 'properties', (c) => {
    const hold = properties(c, 'hold');
    delete hold.inboundMag;
    delete hold.inboundTrue;
  }),
  broken('an inbound track of 360', 'hold', 'properties.inboundMag', (c) => {
    properties(c, 'hold').inboundMag = 360;
  }),
  broken('a callsign of 33 characters', 'ctr', 'properties.callsign', (c) => {
    properties(c, 'ctr').callsign = 'C'.repeat(33);
  }),
  broken('repeated frequencies', 'ctr', 'properties.freqs', (c) => {
    const ctr = properties(c, 'ctr');
    ctr.freqs = Array.isArray(ctr.freqs) ? [...ctr.freqs, ...ctr.freqs] : [];
  }),
  broken('an unknown property', 'fix', 'properties', (c) => {
    properties(c, 'fix').colour = 'red';
  }),
  broken('a latitude of 91', 'ad', 'geometry.coordinates[1]', (c) => {
    const position = feature(c, 'ad').geometry.coordinates;
    if (Array.isArray(position)) position[1] = 91;
  }),
  broken('an area name of 65 characters', 'ctr', 'properties.name', (c) => {
    properties(c, 'ctr').name = 'N'.repeat(65);
  }),
  broken('properties null', 'ad', 'properties', (c) => {
    feature(c, 'ad').properties = null;
  }),
];
