import { describe, expect, it } from 'bun:test';

import { chosenScenarios } from './scenarios';

const ALL = { import: 1, idle: 2, pan: 3, toggle: 4 };

describe('chosenScenarios', () => {
  it('runs them all, in their order, unless told otherwise', () => {
    // Arrange
    const asked = undefined;

    // Act
    const chosen = chosenScenarios(ALL, asked);

    // Assert
    expect(chosen.map(([name]) => name)).toEqual(['import', 'idle', 'pan', 'toggle']);
  });

  it('runs those named, in their order, the import first as what the rest need', () => {
    // Arrange
    const asked = 'toggle,idle';

    // Act
    const chosen = chosenScenarios(ALL, asked);

    // Assert
    expect(chosen.map(([name]) => name)).toEqual(['import', 'idle', 'toggle']);
  });

  it('refuses a name this run does not have', () => {
    // Arrange
    const noMap = { idle: 2, pan: 3 };

    // Act
    const choose = () => chosenScenarios(noMap, 'idle,toggle');

    // Assert
    expect(choose).toThrow('no scenario toggle in this run: it has idle, pan');
  });
});
