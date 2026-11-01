import { describe, expect, it } from 'bun:test';

import { setSettings, settings } from './settings';

describe('settings', () => {
  it('replaces the exceptions of a layer with the set it is given', () => {
    // Arrange
    setSettings('exceptions', 'fix', new Set(['a', 'b']));

    // Act
    setSettings('exceptions', 'fix', new Set(['c']));

    // Assert
    expect([...(settings.exceptions.fix ?? [])]).toEqual(['c']);
  });
});
