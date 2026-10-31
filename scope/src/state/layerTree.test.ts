import { describe, expect, it } from 'bun:test';

import { isOpen, type OpenList, toggleOpen } from './layerTree';
import { setSettings, settings } from './settings';

describe('toggleOpen', () => {
  it('opens a closed row, leaving the other list alone', () => {
    // Arrange
    const lists: OpenList[] = ['openGroups', 'openLayers'];
    setSettings('openGroups', ['POINTS']);
    setSettings('openLayers', ['fix']);

    // Act
    lists.forEach((list) => toggleOpen(list, 'NEW'));

    // Assert
    expect(lists.map((list) => isOpen(list, 'NEW'))).toEqual([true, true]);
    expect(settings.openGroups).toEqual(['POINTS', 'NEW']);
    expect(settings.openLayers).toEqual(['fix', 'NEW']);
  });

  it('closes an open row, keeping what else is open', () => {
    // Arrange
    setSettings('openGroups', ['POINTS', 'ROUTES']);

    // Act
    toggleOpen('openGroups', 'POINTS');

    // Assert
    expect(settings.openGroups).toEqual(['ROUTES']);
  });
});
