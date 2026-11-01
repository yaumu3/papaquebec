import { describe, expect, it } from 'bun:test';

import { footprintOf, stacksOf } from './labelStacks';
import type { LonLat } from './mapdata';

const a: LonLat = [130.1, 33.1];
const b: LonLat = [130.2, 33.1];
const c: LonLat = [130.2, 33.2];
const d: LonLat = [130.1, 33.2];
const mid: LonLat = [130.15, 33.1];

describe('footprintOf', () => {
  it('is the set of a ring vertices, whichever the start and direction', () => {
    // Arrange
    const rings: LonLat[][] = [
      [a, b, c, d, a],
      [c, b, a, d, c],
      [a, mid, b, c, d, a],
    ];

    // Act
    const [plain, turned, more] = rings.map(footprintOf);

    // Assert
    expect(turned).toBe(plain);
    expect(more).not.toBe(plain);
  });
});

interface Member {
  name: string;
  footprint: string | undefined;
  lowerFt: number;
}

const member = (name: string, footprint: string | undefined, lowerFt: number): Member => ({
  name,
  footprint,
  lowerFt,
});

const stacks = (members: Member[]) =>
  stacksOf(
    members,
    (m) => m.footprint,
    (m) => m.lowerFt,
    (m) => m.name,
  ).map((stack) => stack.map((m) => m.name));

describe('stacksOf', () => {
  it('stacks the members of one footprint, lowest limit first', () => {
    // Arrange
    const members = [member('HIGH', 'F', 33500), member('LOW', 'F', 0)];

    // Act
    const result = stacks(members);

    // Assert
    expect(result).toEqual([['LOW', 'HIGH']]);
  });

  it('keeps members of different footprints apart, and a member with none alone', () => {
    // Arrange
    const members = [
      member('A', 'F', 0),
      member('B', 'G', 0),
      member('C', undefined, 0),
      member('D', undefined, 0),
    ];

    // Act
    const result = stacks(members);

    // Assert
    expect(result).toEqual([['A'], ['B'], ['C'], ['D']]);
  });

  it('orders equal limits by name', () => {
    // Arrange
    const members = [member('B', 'F', 0), member('A', 'F', 0)];

    // Act
    const result = stacks(members);

    // Assert
    expect(result).toEqual([['A', 'B']]);
  });
});
