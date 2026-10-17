import { describe, expect, it } from 'bun:test';

import {
  addPlotLane,
  detailTab,
  historyOpen,
  hoverInstant,
  movePlotLane,
  plotted,
  removePlotLane,
  setHoverInstant,
  setPlotted,
  switchPlotLane,
  toggleHistory,
} from './history';
import { DEFAULT_PLOTTED } from './plotted';
import { persisted } from './settings';

describe('history state', () => {
  it('starts from the persisted plot, the default readings with nothing stored', () => {
    // Arrange
    const defaults = [...DEFAULT_PLOTTED];

    // Act
    const keys = persisted.plotted;

    // Assert
    expect(keys).toEqual(defaults);
  });

  it('removes a lane', () => {
    // Arrange
    setPlotted([...DEFAULT_PLOTTED, 'vs']);

    // Act
    removePlotLane('alt');

    // Assert
    expect(plotted()).toEqual(['gs', 'vs']);
  });

  it('moves a lane to another place', () => {
    // Arrange
    setPlotted(['gs', 'vs']);

    // Act
    movePlotLane(1, 0);

    // Assert
    expect(plotted()).toEqual(['vs', 'gs']);
  });

  it('switches a lane to another in its place', () => {
    // Arrange
    setPlotted(['alt', 'gs']);

    // Act
    switchPlotLane('alt', 'roll');

    // Assert
    expect(plotted()).toEqual(['roll', 'gs']);
  });

  it('adds a lane at the end', () => {
    // Arrange
    setPlotted(['alt', 'gs']);

    // Act
    addPlotLane('roll');

    // Assert
    expect(plotted()).toEqual(['alt', 'gs', 'roll']);
  });

  it('starts on the persisted tab, NOW with nothing stored', () => {
    // Arrange
    const stored = persisted.detailTab;

    // Act
    const tab = detailTab();

    // Assert
    expect([stored, tab]).toEqual(['now', 'now']);
  });

  it('starts with the history group open and folds it on a toggle', () => {
    // Arrange
    const before = historyOpen();

    // Act
    toggleHistory();

    // Assert
    expect([before, historyOpen()]).toEqual([true, false]);
  });

  it('starts with no instant under the pointer and takes one', () => {
    // Arrange
    const before = hoverInstant();

    // Act
    setHoverInstant(1234);

    // Assert
    expect([before, hoverInstant()]).toEqual([null, 1234]);
  });
});
