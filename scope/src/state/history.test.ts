import { describe, expect, it } from 'bun:test';

import {
  closePlotLane,
  historyOpen,
  hoverInstant,
  movePlotLane,
  plotted,
  setHoverInstant,
  setPlotted,
  toggleHistory,
  togglePlot,
} from './history';
import { DEFAULT_PLOTTED } from './plotted';

describe('history state', () => {
  it('starts with the default readings plotted', () => {
    // Arrange
    const defaults = [...DEFAULT_PLOTTED];

    // Act
    const keys = plotted();

    // Assert
    expect(keys).toEqual(defaults);
  });

  it('toggles a reading on, in a lane of its own', () => {
    // Arrange
    setPlotted(DEFAULT_PLOTTED);

    // Act
    togglePlot('vs');

    // Assert
    expect(plotted()).toEqual([...DEFAULT_PLOTTED, 'vs']);
  });

  it('closes a lane with the intents drawn in it', () => {
    // Arrange
    setPlotted([...DEFAULT_PLOTTED, 'vs']);

    // Act
    closePlotLane('alt');

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
