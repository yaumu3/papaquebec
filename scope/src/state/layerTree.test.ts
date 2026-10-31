import { describe, expect, it } from 'bun:test';

import {
  isOpen,
  type OpenList,
  query,
  searching,
  setQuery,
  toggleOpen,
  typeQuery,
} from './layerTree';
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

const remembered = () => [settings.openGroups, settings.openLayers];

describe('searching the tree', () => {
  it('waits for a composition to end before the query changes', () => {
    // Arrange
    setQuery('');

    // Act
    typeQuery('ct', true);

    // Assert
    expect(query()).toBe('');
    expect(searching()).toBe(false);
  });

  it('takes the text once the composition has ended', () => {
    // Arrange
    setQuery('');

    // Act
    typeQuery('ctr', false);

    // Assert
    expect(query()).toBe('ctr');
    expect(searching()).toBe(true);
  });

  it('is no search for a query of spaces', () => {
    // Arrange
    setQuery('');

    // Act
    setQuery('   ');

    // Assert
    expect(searching()).toBe(false);
  });

  it('has every row open, whatever was remembered, and remembers nothing of it', () => {
    // Arrange
    setSettings('openGroups', ['POINTS']);
    setSettings('openLayers', []);
    setQuery('');

    // Act
    setQuery('ctr');

    // Assert
    expect(isOpen('openGroups', 'AIRSPACE')).toBe(true);
    expect(isOpen('openLayers', 'ctr')).toBe(true);
    expect(remembered()).toEqual([['POINTS'], []]);
  });

  it('keeps a row closed that was closed while searching, until the query changes', () => {
    // Arrange
    setSettings('openGroups', ['POINTS']);
    setSettings('openLayers', []);
    setQuery('ctr');
    toggleOpen('openGroups', 'AIRSPACE');
    const closed = isOpen('openGroups', 'AIRSPACE');

    // Act
    setQuery('ctrl');

    // Assert
    expect(closed).toBe(false);
    expect(isOpen('openGroups', 'AIRSPACE')).toBe(true);
    expect(remembered()).toEqual([['POINTS'], []]);
  });

  it('gives back the remembered rows when the search is cleared', () => {
    // Arrange
    setSettings('openGroups', ['POINTS']);
    setSettings('openLayers', ['fix']);
    setQuery('ctr');
    toggleOpen('openGroups', 'POINTS');

    // Act
    setQuery('');

    // Assert
    expect(isOpen('openGroups', 'POINTS')).toBe(true);
    expect(isOpen('openGroups', 'AIRSPACE')).toBe(false);
    expect(isOpen('openLayers', 'fix')).toBe(true);
    expect(remembered()).toEqual([['POINTS'], ['fix']]);
  });
});
