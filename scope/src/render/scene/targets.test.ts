import { describe, expect, it } from 'bun:test';

import { blockDir, blockOffset } from '../../lib/datablock';
import type { Track } from '../../state/track';
import { MOVE_MS } from '../layout/moves';
import { type Batch, Shape } from '../protocol';
import { atlas } from './atlasFixture';
import { buildTargets, type TargetInput } from './targets';
import { makeTrack } from './trackFixture';

function track(over: Partial<Track> = {}): Track {
  return makeTrack({
    track: 90,
    history: [
      { lat: 0, lon: 0, x: 0, y: 2, t: 988, alt: 11000 },
      { lat: 0, lon: 0, x: 0.5, y: 2, t: 998, alt: 11000 },
      { lat: 0, lon: 0, x: 1, y: 2, t: 1008, alt: 11000 },
    ],
    ...over,
  });
}

function input(tracks: Track[], over: Partial<TargetInput> = {}): TargetInput {
  return {
    tracks,
    now: 1008,
    filter: { ground: true, lowerFl: 0, upperFl: 500, squawk: 'all' },
    vectorMin: 2,
    trailSec: 60,
    selected: null,
    atlas,
    labelDrag: null,
    moves: new Map(),
    drawAt: 0,
    altimeter: { transitionAltFt: 14000, qnhInHg: 29.92 },
    ...over,
  };
}

const byKind = (batches: Batch[], kind: Batch['kind']) => batches.filter((b) => b.kind === kind);
const count = (batches: Batch[], kind: Batch['kind']) =>
  byKind(batches, kind).reduce((n, b) => n + b.count, 0);
const shapes = (batches: Batch[]) =>
  byKind(batches, 'markers').flatMap((b) =>
    Array.from({ length: b.count }, (_, i) => b.data[i * 12 + 5]),
  );

describe('buildTargets', () => {
  it('renders a filtered target in full while it is selected', () => {
    // Arrange
    const t = track({ alt: 45000 });
    const band = { ground: true, lowerFl: 0, upperFl: 200, squawk: 'all' as const };

    // Act
    const batches = buildTargets(input([t], { filter: band, selected: 'd00001' }));

    // Assert
    expect(shapes(batches).filter((s) => s !== Shape.Dot)).toEqual([Shape.Square]);
    expect(count(batches, 'text')).toBeGreaterThan(0);
  });

  it('omits the vector when it is off', () => {
    // Arrange
    const t = track();

    // Act
    const batches = buildTargets(input([t], { vectorMin: 0 }));

    // Assert
    expect(count(batches, 'lines')).toBe(2 + 1); // two trail slashes, leader
  });

  it('skips targets without a drawable position', () => {
    // Arrange
    const t = track({ position: { kind: 'none' } });

    // Act
    const batches = buildTargets(input([t]));

    // Assert
    expect(count(batches, 'markers')).toBe(0);
    expect(count(batches, 'text')).toBe(0);
  });
});

describe('buildTargets while a block moves', () => {
  it('draws the block between where it was and where it goes', () => {
    // Arrange
    const t = track();
    const from = { dx: -200, dy: 100 };
    const to = blockOffset(blockDir(t.ops.dir), 0);
    const moves = new Map([[t.hex, { from, to, startedAt: 1000 }]]);

    // Act
    const batches = buildTargets(input([t], { moves, drawAt: 1000 + MOVE_MS / 2 }));

    // Assert
    const text = byKind(batches, 'text')[0];
    const firstGlyphX = text?.data[2] ?? 0;
    expect(firstGlyphX).toBeGreaterThan(from.dx);
    expect(firstGlyphX).toBeLessThan(to.dx);
  });
});
