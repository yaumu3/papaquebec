import { describe, expect, it } from 'bun:test';

import {
  addPlotLane,
  lanesView,
  hoverInstant,
  keepViewOf,
  movePlotLane,
  plotted,
  removePlotLane,
  setLanesWindow,
  setHoverInstant,
  setLaneScroll,
  setPlotted,
  switchPlotLane,
} from './lanes';
import { DEFAULT_PLOTTED } from './plotted';
import { persisted } from './settings';
import { DEFAULT_WINDOW, type LanesWindow } from './window';

describe('lanes state', () => {
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
    setPlotted(['alt', 'gs', 'vs']);

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

  it('starts with no instant under the pointer and takes one', () => {
    // Arrange
    const before = hoverInstant();

    // Act
    setHoverInstant(1234);

    // Assert
    expect([before, hoverInstant()]).toEqual([null, 1234]);
  });

  it('keeps the window set for a target', () => {
    // Arrange
    const held: LanesWindow = { kind: 'held', from: 100, to: 220 };
    setLanesWindow('a', held);

    // Act
    const view = lanesView('a');

    // Assert
    expect(view.window).toEqual(held);
  });

  it('keeps the lane scroll set for a target', () => {
    // Arrange
    setLaneScroll('a', 140);

    // Act
    const view = lanesView('a');

    // Assert
    expect(view.scrollTop).toBe(140);
  });

  it('keeps the window by reference when the lanes scroll', () => {
    // Arrange
    const held: LanesWindow = { kind: 'held', from: 100, to: 220 };
    setLanesWindow('a', held);
    setLaneScroll('a', 90);

    // Act
    const { window: kept } = lanesView('a');

    // Assert
    expect(kept).toBe(held);
  });

  it('starts another target on the default window and at the top', () => {
    // Arrange
    setLanesWindow('a', { kind: 'held', from: 100, to: 220 });
    setLaneScroll('a', 140);

    // Act
    const view = lanesView('b');

    // Assert
    expect(view).toEqual({ hex: 'b', window: DEFAULT_WINDOW, scrollTop: 0 });
  });

  it('forgets the view once another target is selected, back at the first too', () => {
    // Arrange
    setLanesWindow('a', { kind: 'held', from: 100, to: 220 });
    keepViewOf('b');
    keepViewOf('a');

    // Act
    const view = lanesView('a');

    // Assert
    expect(view).toEqual({ hex: 'a', window: DEFAULT_WINDOW, scrollTop: 0 });
  });
});
