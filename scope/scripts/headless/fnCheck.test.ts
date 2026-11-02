import { describe, expect, it } from 'bun:test';

import { fnProblems } from './fnCheck';

describe('fnProblems', () => {
  it('passes a name declared once', () => {
    // Arrange
    const bundle = 'function buildRings(input) {}\nasync function buildCoast() {}';

    // Act
    const problems = fnProblems(['buildRings', 'buildCoast'], bundle);

    // Assert
    expect(problems).toEqual([]);
  });

  it('fails on a name no function has', () => {
    // Arrange
    const bundle = 'function buildRings(input) {}';

    // Act
    const problems = fnProblems(['buildChart'], bundle);

    // Assert
    expect(problems).toEqual(['buildChart: no function has this name']);
  });

  it('fails on a name declared twice', () => {
    // Arrange
    const bundle = 'function runsOf(a) {}\nfunction runsOf(b) {}';

    // Act
    const problems = fnProblems(['runsOf'], bundle);

    // Assert
    expect(problems).toEqual(['runsOf: 2 functions have this name']);
  });

  it('counts a duplicate the bundler renamed', () => {
    // Arrange
    const bundle = 'function drawRuns(a) {}\nfunction drawRuns$1(b) {}\nfunction runsOf2(c) {}';

    // Act
    const problems = fnProblems(['drawRuns', 'runsOf'], bundle);

    // Assert
    expect(problems).toEqual(['drawRuns: 2 functions have this name']);
  });

  it('takes no name for a longer one, or for an arrow or a method', () => {
    // Arrange
    const bundle = 'function buildTargetsNow() {}\nconst show = () => {};\nx = { setSlot(a) {} };';

    // Act
    const problems = fnProblems(['buildTargets', 'show', 'setSlot'], bundle);

    // Assert
    expect(problems).toEqual([
      'buildTargets: no function has this name',
      'show: no function has this name',
      'setSlot: no function has this name',
    ]);
  });
});
