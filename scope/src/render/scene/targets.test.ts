import { describe, expect, it } from 'bun:test';

import { NE } from '../../lib/datablock';
import type { Track } from '../../state/track';
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

/** A live target at world `x`, `y` NM. */
const trackAt = (hex: string, x: number, y: number) =>
  track({ hex, position: { kind: 'live', lat: 0, lon: 0, x, y } });

function input(tracks: Track[], over: Partial<TargetInput> = {}): TargetInput {
  return {
    tracks,
    now: 1008,
    filter: { ground: true, lowerFl: 0, upperFl: 500, squawk: 'all' },
    vectorMin: 2,
    trailSec: 60,
    selected: null,
    pxPerNm: 10,
    atlas,
    labelDrag: null,
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
  it('draws a glyph, a vector, a leader, trail slashes and two text lines for a live target', () => {
    // Arrange
    const t = track();

    // Act
    const { batches } = buildTargets(input([t]));

    // Assert
    expect(shapes(batches)).toEqual([Shape.Square]);
    expect(count(batches, 'lines')).toBe(2 + 1 + 1); // two trail slashes, vector, leader
    expect(count(batches, 'text')).toBe('TEST01'.length + '110B789'.length); // spaces emit nothing
  });

  it('reduces a filtered target to a bare hollow diamond', () => {
    // Arrange
    const t = track({ alt: 45000 });

    // Act
    const { batches } = buildTargets(
      input([t], { filter: { ground: true, lowerFl: 0, upperFl: 200, squawk: 'all' } }),
    );

    // Assert
    expect(shapes(batches)).toEqual([Shape.HollowDiamond]);
    expect(count(batches, 'text')).toBe(0);
    expect(count(batches, 'lines')).toBe(0);
  });

  it('renders a filtered target in full while it is selected', () => {
    // Arrange
    const t = track({ alt: 45000 });
    const band = { ground: true, lowerFl: 0, upperFl: 200, squawk: 'all' as const };

    // Act
    const { batches } = buildTargets(input([t], { filter: band, selected: 'd00001' }));

    // Assert
    expect(shapes(batches).filter((s) => s !== Shape.Dot)).toEqual([Shape.Square]);
    expect(count(batches, 'text')).toBeGreaterThan(0);
  });

  it('omits the trail when the operator hid it and the vector when it is off', () => {
    // Arrange
    const t = track({ ops: { hideTrail: true, dir: null } });

    // Act
    const { batches } = buildTargets(input([t], { vectorMin: 0 }));

    // Assert
    expect(count(batches, 'lines')).toBe(1); // leader only
  });

  it('skips targets without a drawable position', () => {
    // Arrange
    const t = track({ position: { kind: 'none' } });

    // Act
    const { batches } = buildTargets(input([t]));

    // Assert
    expect(count(batches, 'markers')).toBe(0);
    expect(count(batches, 'text')).toBe(0);
  });

  it('draws a dragged block at the drag offset instead of at its direction', () => {
    // Arrange
    const t = track();
    const drag = { hex: 'd00001', dx: -100, dy: 30 };

    // Act
    const { batches } = buildTargets(input([t], { labelDrag: drag }));

    // Assert
    const text = byKind(batches, 'text')[0];
    const glyphOffsets = Array.from(
      { length: text?.count ?? 0 },
      (_, i) => text?.data[i * 16 + 2] ?? 0,
    );
    expect(Math.max(...glyphOffsets)).toBeLessThan(0); // whole block sits left of the target
  });

  it('draws every retained history fix as a dot for the selected target only', () => {
    // Arrange
    const t = track();
    const other = track({ hex: 'd00002', flight: 'TEST02' });

    // Act
    const all = shapes(buildTargets(input([t, other], { selected: 'd00001' })).batches);
    const none = shapes(buildTargets(input([t, other])).batches);

    // Assert
    expect(all.filter((s) => s === Shape.Dot)).toHaveLength(t.history.length);
    expect(none.filter((s) => s === Shape.Dot)).toHaveLength(0);
  });

  it('returns the direction chosen for each data block so the store can remember it', () => {
    // Arrange
    const t = track();

    // Act
    const { dirs } = buildTargets(input([t]));

    // Assert
    expect(dirs.get('d00001')).toBe(NE);
  });

  it('lays blocks out at the given scale, moving one aside only where the targets crowd', () => {
    // Arrange
    const tracks = [trackAt('d0000a', 0, 0), trackAt('d0000b', 0.3, 0.15)];
    const scales = [100, 1000];

    // Act
    const dirs = scales.map((pxPerNm) => buildTargets(input(tracks, { pxPerNm })).dirs);

    // Assert
    expect(dirs.map((d) => d.get('d0000a') === NE)).toEqual([false, true]);
  });
});
