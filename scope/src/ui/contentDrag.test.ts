import { describe, expect, it } from 'bun:test';

import { type ContentReads, type Finger, type Fingers, trackContentTouches } from './contentDrag';

const finger = (identifier: number, clientY: number, clientX = 100): Finger => ({
  identifier,
  clientX,
  clientY,
});

/** A touch event at `timeStamp` with `touches` down, of which `changed` started, moved or lifted. */
const fingers = (timeStamp: number, touches: Finger[], changed: Finger[] = touches): Fingers => ({
  touches,
  changedTouches: changed,
  target: null,
  timeStamp,
});

/** A tracker over content that is free, scrolled to its top and short of the largest detent unless `reads` says otherwise, recording every pull. */
function subject(reads: Partial<ContentReads> = {}) {
  const pulls: [string, number, number][] = [];
  const t = trackContentTouches(
    {
      down: (y, at) => pulls.push(['down', y, at]),
      move: (y, at) => pulls.push(['move', y, at]),
      up: (y, at) => pulls.push(['up', y, at]),
    },
    { free: () => true, atTop: () => true, atLargest: () => false, ...reads },
  );
  return { pulls, t };
}

describe('trackContentTouches', () => {
  it('pulls the sheet with a lone finger from where it landed until it lifts', () => {
    // Arrange
    const { pulls, t } = subject();
    t.start(fingers(0, [finger(1, 500)]));
    t.move(fingers(10, [finger(1, 480)]));

    // Act
    t.end(fingers(20, [], [finger(1, 470)]));

    // Assert
    expect(pulls).toEqual([
      ['down', 500, 0],
      ['move', 480, 10],
      ['up', 470, 20],
    ]);
  });

  it('claims every move of a pull, so that the content does not scroll', () => {
    // Arrange
    const { t } = subject();
    t.start(fingers(0, [finger(1, 500)]));
    t.move(fingers(10, [finger(1, 480)]));

    // Act
    const claimed = t.move(fingers(20, [finger(1, 460)]));

    // Assert
    expect(claimed).toBe(true);
  });

  it('keeps pulling with the finger that started when a second lands, wherever it is listed', () => {
    // Arrange
    const { pulls, t } = subject();
    t.start(fingers(0, [finger(1, 500)]));
    t.move(fingers(10, [finger(1, 480)]));
    t.start(fingers(20, [finger(2, 300), finger(1, 480)], [finger(2, 300)]));

    // Act
    const claimed = t.move(fingers(30, [finger(2, 300), finger(1, 450)], [finger(1, 450)]));

    // Assert
    expect(claimed).toBe(true);
    expect(pulls.at(-1)).toEqual(['move', 450, 30]);
  });

  it('lets a second finger move without pulling the sheet', () => {
    // Arrange
    const { pulls, t } = subject();
    t.start(fingers(0, [finger(1, 500)]));
    t.move(fingers(10, [finger(1, 480)]));
    t.start(fingers(20, [finger(1, 480), finger(2, 300)], [finger(2, 300)]));

    // Act
    t.move(fingers(30, [finger(1, 480), finger(2, 250)], [finger(2, 250)]));

    // Assert
    expect(pulls).toEqual([
      ['down', 500, 0],
      ['move', 480, 10],
    ]);
  });

  it('lets a second finger lift without releasing the sheet', () => {
    // Arrange
    const { pulls, t } = subject();
    t.start(fingers(0, [finger(1, 500)]));
    t.move(fingers(10, [finger(1, 480)]));
    t.start(fingers(20, [finger(1, 480), finger(2, 300)], [finger(2, 300)]));

    // Act
    t.end(fingers(30, [finger(1, 480)], [finger(2, 300)]));

    // Assert
    expect(pulls.some(([name]) => name === 'up')).toBe(false);
  });

  it('releases the sheet when the finger that pulls it lifts after a second landed', () => {
    // Arrange
    const { pulls, t } = subject();
    t.start(fingers(0, [finger(1, 500)]));
    t.move(fingers(10, [finger(1, 480)]));
    t.start(fingers(20, [finger(1, 480), finger(2, 300)], [finger(2, 300)]));

    // Act
    t.end(fingers(30, [finger(2, 300)], [finger(1, 470)]));

    // Assert
    expect(pulls.at(-1)).toEqual(['up', 470, 30]);
  });

  it('leaves the content to scroll where the sheet would not move that way', () => {
    // Arrange
    const runs = [
      subject({ atTop: () => false }),
      subject({ atLargest: () => true }),
      subject({ free: () => false }),
    ];
    const moves = [520, 480, 480];
    for (const { t } of runs) t.start(fingers(0, [finger(1, 500)]));

    // Act
    const claimed = runs.map(({ t }, i) => t.move(fingers(10, [finger(1, moves[i] ?? 500)])));

    // Assert
    expect(claimed).toEqual([false, false, false]);
    expect(runs.flatMap(({ pulls }) => pulls)).toEqual([]);
  });
});
