import { describe, expect, it } from 'bun:test';

import {
  addPlotLane,
  detailTab,
  lanesView,
  hoverInstant,
  keepViewOf,
  movePlotLane,
  plotted,
  removePlotLane,
  setLanesSpan,
  setHoverInstant,
  setLaneScroll,
  setPlotted,
  switchPlotLane,
} from './lanes';
import { DEFAULT_PLOTTED } from './plotted';
import { persisted } from './settings';
import { type Span, WHOLE } from './span';

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

  it('starts with no instant under the pointer and takes one', () => {
    // Arrange
    const before = hoverInstant();

    // Act
    setHoverInstant(1234);

    // Assert
    expect([before, hoverInstant()]).toEqual([null, 1234]);
  });

  it('keeps the span set for a target', () => {
    // Arrange
    const tail: Span = { kind: 'tail', sec: 120 };
    setLanesSpan('a', tail);

    // Act
    const view = lanesView('a');

    // Assert
    expect(view.span).toEqual(tail);
  });

  it('keeps the lane scroll set for a target', () => {
    // Arrange
    setLaneScroll('a', 140);

    // Act
    const view = lanesView('a');

    // Assert
    expect(view.scrollTop).toBe(140);
  });

  it('keeps the span by reference when the lanes scroll', () => {
    // Arrange
    const tail: Span = { kind: 'tail', sec: 120 };
    setLanesSpan('a', tail);
    setLaneScroll('a', 90);

    // Act
    const { span } = lanesView('a');

    // Assert
    expect(span).toBe(tail);
  });

  it('starts another target whole and at the top', () => {
    // Arrange
    setLanesSpan('a', { kind: 'tail', sec: 120 });
    setLaneScroll('a', 140);

    // Act
    const view = lanesView('b');

    // Assert
    expect(view).toEqual({ hex: 'b', span: WHOLE, scrollTop: 0 });
  });

  it('forgets the view once another target is selected, back at the first too', () => {
    // Arrange
    setLanesSpan('a', { kind: 'tail', sec: 120 });
    keepViewOf('b');
    keepViewOf('a');

    // Act
    const view = lanesView('a');

    // Assert
    expect(view).toEqual({ hex: 'a', span: WHOLE, scrollTop: 0 });
  });
});
