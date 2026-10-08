import { describe, expect, it } from 'bun:test';

import { advisoryWord, type ResolutionAdvisory } from './acas';

const advisory = (
  over: Partial<NonNullable<ResolutionAdvisory['advisory']>> = {},
): ResolutionAdvisory => ({
  multipleThreats: false,
  advisory: {
    corrective: true,
    downward: false,
    increasedRate: false,
    senseReversal: false,
    altitudeCrossing: false,
    positive: true,
    ...over,
  },
  terminated: false,
});

const corrections = (
  over: Partial<NonNullable<ResolutionAdvisory['corrections']>> = {},
): ResolutionAdvisory => ({
  multipleThreats: true,
  corrections: {
    upward: false,
    positiveClimb: false,
    downward: false,
    positiveDescent: false,
    crossing: false,
    senseReversal: false,
    ...over,
  },
  terminated: false,
});

describe('advisoryWord', () => {
  it('names the advisory of one threat as TCAS announces it', () => {
    // Arrange
    const advisories = [
      advisory(),
      advisory({ downward: true }),
      advisory({ increasedRate: true }),
      advisory({ downward: true, increasedRate: true }),
      advisory({ altitudeCrossing: true }),
      advisory({ senseReversal: true, altitudeCrossing: true }),
      advisory({ positive: false }),
      advisory({ corrective: false, positive: false }),
      advisory({ corrective: false }),
      { ...advisory(), terminated: true },
    ];

    // Act
    const words = advisories.map(advisoryWord);

    // Assert
    expect(words).toEqual([
      'CLIMB',
      'DESCEND',
      'INCREASE CLIMB',
      'INCREASE DESCENT',
      'CROSSING CLIMB',
      'CLIMB NOW',
      'ADJUST VS',
      'MONITOR VS',
      'MAINTAIN VS',
      'CLEAR',
    ]);
  });

  it('names what several threats call for', () => {
    // Arrange
    const advisories = [
      corrections({ upward: true, positiveClimb: true }),
      corrections({ downward: true, positiveDescent: true, crossing: true }),
      corrections({ upward: true, downward: true }),
    ];

    // Act
    const words = advisories.map(advisoryWord);

    // Assert
    expect(words).toEqual(['CLIMB', 'CROSSING DESCEND', 'ADJUST VS']);
  });
});
