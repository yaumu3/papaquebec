import { afterEach, describe, expect, it } from 'bun:test';

import { parseMapSet } from '../lib/mapset';
import { EXAMPLE } from '../lib/mapsetCorpus';
import { everyItemSet, isItemShown } from '../lib/visibility';
import { layerState, setLayerState } from './drawn';
import {
  blurRow,
  enterRow,
  focusRow,
  isOpen,
  leaveRow,
  type OpenList,
  pointedAt,
  pointedItem,
  query,
  searching,
  setQuery,
  toggleOpen,
  typeQuery,
} from './layerTree';
import { mapSets, setBuiltinMapSet, topology } from './mapsets';
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

const rest = () => {
  leaveRow('a');
  leaveRow('b');
  blurRow('a');
  blurRow('b');
};

describe('pointedAt', () => {
  it('is the row under the mouse, over the row with focus', () => {
    // Arrange
    rest();
    focusRow('a');

    // Act
    enterRow('b');

    // Assert
    expect(pointedAt()).toBe('b');
  });

  it('is the row with focus when the mouse leaves', () => {
    // Arrange
    rest();
    focusRow('a');
    enterRow('b');

    // Act
    leaveRow('b');

    // Assert
    expect(pointedAt()).toBe('a');
  });

  it('is nothing when the mouse and the focus have left', () => {
    // Arrange
    rest();
    focusRow('a');
    enterRow('b');
    leaveRow('b');

    // Act
    blurRow('a');

    // Assert
    expect(pointedAt()).toBeNull();
  });

  it('ignores a leave of a row not under the mouse', () => {
    // Arrange
    rest();
    enterRow('b');

    // Act
    leaveRow('a');

    // Assert
    expect(pointedAt()).toBe('b');
  });

  it('ignores a blur of a row without focus', () => {
    // Arrange
    rest();
    focusRow('a');

    // Act
    blurRow('b');

    // Assert
    expect(pointedAt()).toBe('a');
  });
});

describe('pointedItem', () => {
  const original = mapSets().find((set) => set.builtin)?.data;
  let key = '';
  afterEach(() => {
    if (original) setBuiltinMapSet(original);
    setLayerState('fix', everyItemSet(true));
    blurRow(key);
  });

  it('is an item whose layer is hidden, since pointing at it is how it is found', () => {
    // Arrange
    setBuiltinMapSet(parseMapSet(EXAMPLE));
    setLayerState('fix', everyItemSet(false));
    key =
      topology().chart.find(
        (item) =>
          item.layer === 'fix' &&
          item.parts.some((p) => 'id' in p.properties && p.properties.id === 'TAVRO'),
      )?.key ?? '';
    // Precondition
    const hidden = !isItemShown(layerState('fix'), key);
    rest();
    focusRow(key);

    // Act
    const item = pointedItem();

    // Assert
    expect(hidden).toBe(true);
    expect(item?.key).toBe(key);
  });
});
