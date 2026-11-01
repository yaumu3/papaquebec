import { describe, expect, it } from 'bun:test';

import { inclusiveMs } from './profile';

const frame = (functionName: string) => ({ functionName });

describe('inclusiveMs', () => {
  it('charges each sample to every named function on its stack, once', () => {
    // Arrange
    const profile = {
      nodes: [
        { id: 1, callFrame: frame('(root)'), children: [2] },
        { id: 2, callFrame: frame('buildTargets'), children: [3, 4] },
        { id: 3, callFrame: frame('placeLabels'), children: [5] },
        { id: 4, callFrame: frame('buildTargets'), children: [] },
        { id: 5, callFrame: frame('overlap') },
      ],
      samples: [5, 3, 4, 1],
      timeDeltas: [0, 1000, 2000, 3000],
    };

    // Act
    const ms = inclusiveMs(profile, ['buildTargets', 'placeLabels', 'buildStatic']);

    // Assert
    expect(ms).toEqual(
      new Map([
        ['buildTargets', 6],
        ['placeLabels', 3],
        ['buildStatic', 0],
      ]),
    );
  });
});
