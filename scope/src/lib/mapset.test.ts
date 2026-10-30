import { describe, expect, it } from 'bun:test';

import { validateMapSet } from './mapset';
import { CORPUS, EXAMPLE, feature, indexOf, properties, ringOf, variant } from './mapsetCorpus';

describe('validateMapSet', () => {
  it('accepts the example', () => {
    // Arrange
    const example = EXAMPLE;

    // Act
    const verdict = validateMapSet(example);

    // Assert
    expect(verdict.ok).toBe(true);
  });

  it('names the Feature and the problem for each broken document', () => {
    // Arrange
    const broken = CORPUS.filter(({ valid }) => !valid);

    // Act
    const messages = broken.map(({ document }) => {
      const verdict = validateMapSet(document);
      return verdict.ok ? null : verdict.message;
    });

    // Assert
    expect(messages.map((m, i) => m?.startsWith(broken[i]?.at ?? '') ?? false)).toEqual(
      broken.map(() => true),
    );
    expect(messages.filter((m) => m?.includes('union'))).toEqual([]);
  });

  it('says which layer is unknown', () => {
    // Arrange
    const broken = CORPUS.find(({ name }) => name === 'an unknown layer');

    // Act
    const verdict = validateMapSet(broken?.document);

    // Assert
    expect(verdict).toEqual({ ok: false, message: expect.stringContaining('unknown layer "xyz"') });
  });
});

/** The first ring of the first area on `layer` after a strict parse of `document`. */
function parsedRing(document: unknown, layer: string): unknown {
  const verdict = validateMapSet(document);
  const area = verdict.ok ? verdict.data.features[indexOf(layer)] : undefined;
  return area?.geometry.type === 'Polygon' ? area.geometry.coordinates[0] : undefined;
}

/** The example with the id of its first `from` Feature given to its first `to` Feature. */
const reusing = (from: string, to: string) =>
  variant((c) => {
    properties(c, to).id = properties(c, from).id;
  });

describe('validateMapSet, beyond the schema', () => {
  it('closes a ring whose last position differs from its first', () => {
    // Arrange
    const open = variant((c) => {
      const rings = feature(c, 'tma').geometry.coordinates;
      if (Array.isArray(rings)) rings[0]?.pop();
    });

    // Act
    const ring = parsedRing(open, 'tma');

    // Assert
    expect(ring).toEqual(ringOf(EXAMPLE, 'tma'));
  });

  it('refuses a point id repeated among aerodromes, navaids and fixes', () => {
    // Arrange
    const table = [
      { document: reusing('ad', 'navaid'), earlier: indexOf('ad'), later: indexOf('navaid') },
      { document: reusing('navaid', 'fix'), earlier: indexOf('navaid'), later: indexOf('fix') },
    ];

    // Act
    const messages = table.map(({ document }) => {
      const verdict = validateMapSet(document);
      return verdict.ok ? null : verdict.message;
    });

    // Assert
    expect(messages).toEqual(
      table.map(
        ({ earlier, later }) =>
          `features[${later}].properties.id: repeats the id of features[${earlier}]`,
      ),
    );
  });

  it('accepts a VFR point id that repeats', () => {
    // Arrange
    const repeated = variant((c) => {
      properties(c, 'vfr').id = properties(c, 'fix').id;
    });

    // Act
    const verdict = validateMapSet(repeated);

    // Assert
    expect(verdict.ok).toBe(true);
  });
});
