import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import { footprintOf, stacksOf } from './labelStacks';
import type { LonLat } from './mapdata';

/** A ring ending where it starts. */
const closed = (vertices: LonLat[]) => [...vertices, ...vertices.slice(0, 1)];

describe('footprintOf', () => {
  it('is the set of a ring vertices, whichever the start and direction', () => {
    // Arrange: vertices a few grid cells apart, the ring closed on its first
    const anyVertex = fc
      .tuple(fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: 9 }))
      .map(([i, j]): LonLat => [130 + i / 1e4, 33 + j / 1e4]);
    const anyOpenRing = fc.uniqueArray(anyVertex, { minLength: 3, maxLength: 8, selector: String });

    fc.assert(
      fc.property(anyOpenRing, fc.nat(), (open, turns) => {
        // Arrange
        const start = turns % open.length;
        const turned = [...open.slice(start), ...open.slice(0, start)];
        const rings = [
          closed(open),
          closed(turned),
          closed(turned.toReversed()),
          closed(open.slice(1)),
        ];

        // Act
        const [plain, fromElsewhere, backwards, fewer] = rings.map(footprintOf);

        // Assert
        expect([fromElsewhere, backwards]).toEqual([plain, plain]);
        expect(fewer).not.toBe(plain);
      }),
    );
  });
});

interface Member {
  name: string;
  footprint: string | undefined;
  lowerFt: number;
}

/** Whether each member of a stack has the lower limit of the one before or a higher, and of equals the later name. */
const inOrder = (stack: Member[]) =>
  stack.every((m, i) => {
    const before = stack[i - 1];
    return (
      !before ||
      before.lowerFt < m.lowerFt ||
      (before.lowerFt === m.lowerFt && before.name <= m.name)
    );
  });

describe('stacksOf', () => {
  it('stacks the members of one footprint, lowest limit first and then by name, and leaves a member with none alone', () => {
    // Arrange: few footprints, limits and names, so that members often share them
    const anyMember = fc.record({
      name: fc.constantFrom('A', 'B', 'C', 'D'),
      footprint: fc.constantFrom('F', 'G', 'H', undefined),
      lowerFt: fc.constantFrom(0, 5000, 33500),
    });
    const anyMembers: fc.Arbitrary<Member[]> = fc.array(anyMember, { maxLength: 12 });

    fc.assert(
      fc.property(anyMembers, (members) => {
        // Act
        const stacks = stacksOf(
          members,
          (m) => m.footprint,
          (m) => m.lowerFt,
          (m) => m.name,
        );

        // Assert
        const firstOf = (stack: Member[]) => Math.min(...stack.map((m) => members.indexOf(m)));
        const shared = stacks.map((stack) => new Set(stack.map((m) => m.footprint)));
        const footprints = shared.flatMap((set) => [...set]).filter((f) => f !== undefined);
        expect(stacks.flat().toSorted((a, b) => members.indexOf(a) - members.indexOf(b))).toEqual(
          members,
        );
        expect(shared.map((set) => set.size)).toEqual(stacks.map(() => 1));
        expect(new Set(footprints).size).toBe(footprints.length);
        expect(
          stacks.filter((stack) => stack[0]?.footprint === undefined).map((s) => s.length),
        ).toEqual(members.filter((m) => m.footprint === undefined).map(() => 1));
        expect(stacks.map(inOrder)).toEqual(stacks.map(() => true));
        expect(stacks.map(firstOf)).toEqual(stacks.map(firstOf).toSorted((a, b) => a - b));
      }),
    );
  });
});
