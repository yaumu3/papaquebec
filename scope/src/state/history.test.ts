import { describe, expect, it } from 'bun:test';

import {
  closePlotLane,
  historyOpen,
  hoverInstant,
  movePlotLane,
  plotted,
  resetPlotted,
  setHoverInstant,
  toggleHistory,
  togglePlot,
} from './history';
import { DEFAULT_PLOTTED } from './plotted';

describe('history state', () => {
  it('plots the default readings until told otherwise', () => {
    // Arrange
    resetPlotted();

    // Act
    const keys = plotted();

    // Assert
    expect(keys).toEqual([...DEFAULT_PLOTTED]);
  });

  it('toggles a reading, closes a lane and moves one', () => {
    // Arrange
    resetPlotted();

    // Act
    togglePlot('vs');
    closePlotLane('alt');
    movePlotLane(1, 0);

    // Assert
    expect(plotted()).toEqual(['vs', 'gs']);
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
