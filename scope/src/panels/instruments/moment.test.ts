import { describe, expect, it } from 'bun:test';

import { makeTrack } from '../../render/scene/trackFixture';
import { makeSample } from '../../state/sampleFixture';
import { momentKey, momentOf } from './moment';

const NOW = 1000;

describe('momentOf', () => {
  it('draws now unless the panel reads the past, else the sample it reads at its own time, or nothing', () => {
    // Arrange
    const t = makeTrack();
    const sample = makeSample(900);
    const reads = [
      { past: false, at: sample },
      { past: true, at: sample },
      { past: true, at: null },
    ];

    // Act
    const moments = reads.map((r) => momentOf(t, r.past, r.at, NOW));

    // Assert
    expect(moments).toEqual([
      { kind: 'now', r: t, instant: NOW },
      { kind: 'sample', r: sample, instant: 900 },
      { kind: 'empty' },
    ]);
  });
});

describe('momentKey', () => {
  it('is steady across the nows and tells each sample and the empty moment apart', () => {
    // Arrange
    const t = makeTrack();
    const reads = [
      { past: false, at: null, now: NOW },
      { past: false, at: null, now: NOW + 1 },
      { past: true, at: makeSample(900), now: NOW },
      { past: true, at: makeSample(910), now: NOW },
      { past: true, at: null, now: NOW },
    ];

    // Act
    const keys = reads.map((r) => momentKey(momentOf(t, r.past, r.at, r.now)));

    // Assert
    expect(keys[0]).toBe(keys[1]);
    expect(new Set(keys).size).toBe(4);
  });
});
