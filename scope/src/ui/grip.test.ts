import { describe, expect, it } from 'bun:test';

import { PULL_PX, trackGrip } from './grip';

/** A grip that counts how often it closed its sheet. */
function grip() {
  let closed = 0;
  const tracked = trackGrip(() => {
    closed += 1;
  });
  return { ...tracked, closed: () => closed };
}

describe('trackGrip', () => {
  it('closes the sheet once on a tap, however little the finger wanders', () => {
    // Arrange
    const g = grip();
    g.down(100);
    g.up(100 + PULL_PX - 1);

    // Act
    g.click();

    // Assert
    expect(g.closed()).toBe(1);
  });

  it('closes the sheet when a finger pulls the grip down, which ends in no click', () => {
    // Arrange
    const g = grip();
    g.down(100);

    // Act
    g.up(100 + PULL_PX);

    // Assert
    expect(g.closed()).toBe(1);
  });

  it('closes the sheet only once when a mouse pulls the grip down and clicks as it lets go', () => {
    // Arrange
    const g = grip();
    g.down(100);
    g.up(100 + PULL_PX);

    // Act
    g.click();

    // Assert
    expect(g.closed()).toBe(1);
  });

  it('leaves the sheet open when the grip is pulled up', () => {
    // Arrange
    const g = grip();
    g.down(100);
    g.up(100 - PULL_PX);

    // Act
    g.click();

    // Assert
    expect(g.closed()).toBe(0);
  });

  it('closes the sheet on a click that no pointer made, as a key makes one', () => {
    // Arrange
    const g = grip();

    // Act
    g.click();

    // Assert
    expect(g.closed()).toBe(1);
  });

  it('takes a tap for a tap after a pull that ended in no click', () => {
    // Arrange
    const g = grip();
    g.down(100);
    g.up(100 - PULL_PX);
    g.down(100);
    g.up(100);

    // Act
    g.click();

    // Assert
    expect(g.closed()).toBe(1);
  });
});
