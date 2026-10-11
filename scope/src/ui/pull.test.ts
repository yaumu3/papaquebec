import { describe, expect, it } from 'bun:test';

import { PULL_PX, trackPull } from './pull';

/** A pull that records what it did to its sheet. */
function pull() {
  const done: (string | [string, number])[] = [];
  const tracked = trackPull({
    tap: () => done.push('tap'),
    drag: (travel) => done.push(['drag', travel]),
    release: (velocity) => done.push(['release', velocity]),
  });
  return { ...tracked, done };
}

describe('trackPull', () => {
  it('taps the sheet once on a tap, however little the finger wanders', () => {
    // Arrange
    const p = pull();
    p.down(100, 0);
    p.move(100 + PULL_PX - 1, 10);
    p.up(100 + PULL_PX - 1, 20);

    // Act
    p.click();

    // Assert
    expect(p.done).toEqual(['tap']);
  });

  it('drags the sheet by how far the finger has come up since it landed', () => {
    // Arrange
    const p = pull();
    p.down(100, 0);

    // Act
    p.move(70, 10);

    // Assert
    expect(p.done).toEqual([['drag', 30]]);
  });

  it('lets the sheet go at the speed the finger lifted off at, upward positive, px/ms', () => {
    // Arrange
    const p = pull();
    p.down(100, 0);
    p.move(80, 10);

    // Act
    p.up(60, 20);

    // Assert
    expect(p.done.at(-1)).toEqual(['release', 2]);
  });

  it('measures the speed over the last moments of the pull only', () => {
    // Arrange
    const p = pull();
    p.down(100, 0);
    p.move(150, 400);
    p.move(150, 500);

    // Act
    p.up(140, 520);

    // Assert
    expect(p.done.at(-1)).toEqual(['release', 0.5]);
  });

  it('lets the sheet go at the speed of its last moves when the finger lifts where it stopped', () => {
    // Arrange
    const p = pull();
    p.down(100, 0);
    p.move(80, 10);
    p.move(60, 20);

    // Act
    p.up(60, 36);

    // Assert
    expect(p.done.at(-1)).toEqual(['release', 2]);
  });

  it('lets the sheet go at no speed when the finger rested before it lifted', () => {
    // Arrange
    const p = pull();
    p.down(100, 0);
    p.move(60, 20);

    // Act
    p.up(60, 300);

    // Assert
    expect(p.done.at(-1)).toEqual(['release', 0]);
  });

  it('lets the sheet go only once when a mouse pulls the grip and clicks as it lets go', () => {
    // Arrange
    const p = pull();
    p.down(100, 0);
    p.up(100 + PULL_PX, 10);

    // Act
    p.click();

    // Assert
    expect(p.done).toEqual([
      ['drag', -PULL_PX],
      ['release', -PULL_PX / 10],
    ]);
  });

  it('ignores a pointer moving over the grip without pressing it', () => {
    // Arrange
    const p = pull();

    // Act
    p.move(50, 10);

    // Assert
    expect(p.done).toEqual([]);
  });

  it('taps the sheet on a click that no pointer made, as a key makes one', () => {
    // Arrange
    const p = pull();

    // Act
    p.click();

    // Assert
    expect(p.done).toEqual(['tap']);
  });

  it('takes a tap for a tap after a pull that ended in no click', () => {
    // Arrange
    const p = pull();
    p.down(100, 0);
    p.up(100 - PULL_PX, 10);
    p.down(100, 20);
    p.up(100, 30);

    // Act
    p.click();

    // Assert
    expect(p.done.at(-1)).toBe('tap');
  });
});
