import { describe, expect, it } from 'bun:test';

import { drawnItemsOf, type ScopeLayer } from './layers';
import type { Layer } from './mapsetFormat';
import type { TreeItem } from './treeItems';
import {
  afterDot,
  groupCount,
  type LayerLeaves,
  layerSummary,
  layerTitle,
  type RowState,
  rowStateOf,
  type StateOf,
} from './treeRows';
import type { LayerState } from './visibility';
import { hiddenExcept, plainState, shownExcept } from './visibilityFixture';

/** A layer with items; `listed` are those the tree lists, all of them unless a search narrows. */
const withItems = (layer: ScopeLayer, present: string[], listed = present): LayerLeaves => ({
  layer,
  listed,
  present,
});

/** A layer that is its own leaf: no items. */
const leaf = (layer: ScopeLayer): LayerLeaves => ({ layer, listed: [], present: [] });

const statesOf =
  (states: Partial<Record<ScopeLayer, LayerState>>): StateOf =>
  (layer) =>
    states[layer] ?? hiddenExcept();

const item = (layer: Layer, name: string): TreeItem => ({
  key: name,
  layer,
  parts: [],
  name,
  tag: '',
});

describe('rowStateOf', () => {
  it('is on when every leaf is shown, off when none is, and mixed otherwise', () => {
    // Arrange
    const stateOf = statesOf({
      fix: shownExcept(),
      navaid: hiddenExcept(),
      ad: hiddenExcept('a'),
      coast: shownExcept(),
      rings: hiddenExcept(),
    });
    const rows: [LayerLeaves[], RowState][] = [
      [[withItems('fix', ['a', 'b'])], 'on'],
      [[withItems('navaid', ['a', 'b'])], 'off'],
      [[withItems('ad', ['a', 'b'])], 'mixed'],
      [[leaf('coast')], 'on'],
      [[leaf('rings')], 'off'],
      [[withItems('fix', ['a']), leaf('coast')], 'on'],
      [[withItems('fix', ['a']), leaf('rings')], 'mixed'],
      [[withItems('ad', ['a', 'b'], ['a'])], 'on'],
    ];

    // Act
    const results = rows.map(([leaves]) => rowStateOf(leaves, stateOf));

    // Assert
    expect(results).toEqual(rows.map(([, expected]) => expected));
  });
});

describe('rowStateOf beyond the navaid range', () => {
  it('keeps the NAVAIDS row on when the range hides the navaids', () => {
    // Arrange
    const stateOf = statesOf({ navaid: shownExcept() });
    const chart = [item('navaid', 'QDG')];
    // Precondition
    const drawnOutOfRange = drawnItemsOf(chart, ['navaid'], stateOf, () => false);

    // Act
    const row = rowStateOf([withItems('navaid', ['QDG'])], stateOf);

    // Assert
    expect(drawnOutOfRange).toEqual([]);
    expect(row).toBe('on');
  });
});

describe('groupCount', () => {
  it('counts the layers of which anything is shown, over the layers listed', () => {
    // Arrange
    const stateOf = statesOf({
      fix: hiddenExcept('a'),
      navaid: hiddenExcept(),
      coast: shownExcept(),
    });
    const leaves = [withItems('fix', ['a', 'b']), withItems('navaid', ['a']), leaf('coast')];

    // Act
    const count = groupCount(leaves, stateOf);

    // Assert
    expect(count).toEqual({ on: 2, all: 3 });
  });
});

describe('afterDot', () => {
  const present = ['a', 'b', 'c'];

  it('shows everything and clears the exceptions of a row that is not on', () => {
    // Arrange
    const stateOf = statesOf({ fix: hiddenExcept('a', 'gone'), coast: hiddenExcept() });
    const leaves = [withItems('fix', present), leaf('coast')];

    // Act
    const result = afterDot(leaves, stateOf, false);

    // Assert
    expect(result.map(([layer, next]) => [layer, plainState(next)])).toEqual([
      ['fix', { mode: true, exceptions: [] }],
      ['coast', { mode: true, exceptions: [] }],
    ]);
  });

  it('hides everything of a row that is on', () => {
    // Arrange
    const stateOf = statesOf({ fix: shownExcept() });
    const leaves = [withItems('fix', present)];

    // Act
    const result = afterDot(leaves, stateOf, false);

    // Assert
    expect(result.map(([layer, next]) => [layer, plainState(next)])).toEqual([
      ['fix', { mode: false, exceptions: [] }],
    ]);
  });

  it('while searching sets only the items listed and keeps the rest', () => {
    // Arrange
    const stateOf = statesOf({ fix: shownExcept('gone') });
    const leaves = [withItems('fix', present, ['a'])];

    // Act
    const result = afterDot(leaves, stateOf, true);

    // Assert
    expect(result.map(([layer, next]) => [layer, plainState(next)])).toEqual([
      ['fix', { mode: true, exceptions: ['gone', 'a'] }],
    ]);
  });

  it('while searching flips a layer whose items are all set the same way', () => {
    // Arrange
    const stateOf = statesOf({ fix: shownExcept() });
    const leaves = [withItems('fix', ['a', 'b'])];

    // Act
    const result = afterDot(leaves, stateOf, true);

    // Assert
    expect(result.map(([layer, next]) => [layer, plainState(next)])).toEqual([
      ['fix', { mode: false, exceptions: [] }],
    ]);
  });

  it('while searching sets the mode of a leaf layer', () => {
    // Arrange
    const stateOf = statesOf({ coast: shownExcept() });
    const leaves = [leaf('coast')];

    // Act
    const result = afterDot(leaves, stateOf, true);

    // Assert
    expect(result.map(([layer, next]) => [layer, plainState(next)])).toEqual([
      ['coast', { mode: false, exceptions: [] }],
    ]);
  });
});

describe('layerSummary', () => {
  const five = ['A', 'B', 'C', 'D', 'E'].map((name) => item('fix', name));

  it('says the count, the shown names, or shown over total, or that there is no data', () => {
    // Arrange
    const rows: [ScopeLayer, TreeItem[], LayerState, ReturnType<typeof layerSummary>][] = [
      ['fix', five, shownExcept(), { text: '5', tone: 'count' }],
      ['fix', five, hiddenExcept(), { text: '5', tone: 'count' }],
      ['fix', five, hiddenExcept('B'), { text: 'B', tone: 'subset' }],
      ['fix', five, hiddenExcept('B', 'D', 'E'), { text: 'B D E', tone: 'subset' }],
      ['fix', five, hiddenExcept('A', 'B', 'D', 'E'), { text: '4/5', tone: 'subset' }],
      ['fix', five, shownExcept('C'), { text: '4/5', tone: 'subset' }],
      ['fix', [], shownExcept(), { text: '—', tone: 'none' }],
      ['coast', [], shownExcept(), null],
      ['rings', [], hiddenExcept(), null],
    ];

    // Act
    const results = rows.map(([layer, items, layerState]) =>
      layerSummary(layer, items, layerState),
    );

    // Assert
    expect(results).toEqual(rows.map(([, , , expected]) => expected));
  });
});

describe('layerTitle', () => {
  it('names a layer in full with its AIP reference, and says when it has no data', () => {
    // Arrange
    const rows: [ScopeLayer, boolean, string][] = [
      ['fix', true, 'FIXES, AIP ENR 4.4'],
      ['fix', false, 'FIXES, AIP ENR 4.4, no data in the enabled sets'],
      ['sector', true, 'SECTORS'],
      ['sector', false, 'SECTORS, no data in the enabled sets'],
      ['advisory', true, 'ADVISORY AREAS, AIP ENR 2.2'],
      ['coast', false, 'COASTLINE'],
      ['rings', false, 'RANGE RINGS'],
    ];

    // Act
    const titles = rows.map(([layer, hasItems]) => layerTitle(layer, hasItems));

    // Assert
    expect(titles).toEqual(rows.map(([, , expected]) => expected));
  });
});
