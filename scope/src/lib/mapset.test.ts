import { describe, expect, it } from 'bun:test';

import { validateMapSet } from './mapset';
import { CORPUS, EXAMPLE } from './mapsetCorpus';

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
