import { describe, expect, it } from 'bun:test';

import type { Corner } from '../../state/track';
import { DB_HEIGHT, labelRect, type LabelSubject, placeLabels } from './labels';

function subject(
  hex: string,
  cx: number,
  cy: number,
  extra: Partial<LabelSubject> = {},
): LabelSubject {
  return { hex, cx, cy, extraLines: 0, pinnedCorner: null, autoCorner: 'ne', ...extra };
}

describe('labelRect', () => {
  it('puts the block on the side of the target that the corner names', () => {
    // Arrange
    const corners: Corner[] = ['ne', 'nw', 'se', 'sw'];

    // Act
    const rects = corners.map((c) => labelRect(100, 100, c, 0));

    // Assert
    expect(rects[0]?.x0).toBeGreaterThan(100);
    expect(rects[0]?.y0).toBeLessThan(100);
    expect(rects[1]?.x1).toBeLessThan(100);
    expect(rects[1]?.y0).toBeLessThan(100);
    expect(rects[2]?.x0).toBeGreaterThan(100);
    expect(rects[2]?.y0).toBeGreaterThan(100);
    expect(rects[3]?.x1).toBeLessThan(100);
    expect(rects[3]?.y0).toBeGreaterThan(100);
  });

  it('grows a block above the target upward by its extra lines', () => {
    // Arrange
    const plain = labelRect(100, 100, 'ne', 0);

    // Act
    const emerg = labelRect(100, 100, 'ne', 1);

    // Assert
    expect(emerg.y1 - emerg.y0).toBeGreaterThan(DB_HEIGHT);
    expect(emerg.y1).toBe(plain.y1);
  });
});

describe('placeLabels', () => {
  it('leaves an uncontested block in its current corner', () => {
    // Arrange
    const subjects = [subject('a', 100, 100, { autoCorner: 'sw' })];

    // Act
    const placed = placeLabels(subjects);

    // Assert
    expect(placed.get('a')).toBe('sw');
  });

  it('moves the lower of two colliding blocks to a free corner', () => {
    // Arrange
    const subjects = [subject('upper', 100, 100), subject('lower', 100, 110)];

    // Act
    const placed = placeLabels(subjects);

    // Assert
    expect(placed.get('upper')).toBe('ne');
    expect(placed.get('lower')).not.toBe('ne');
  });

  it('never moves a pinned block, even when it collides', () => {
    // Arrange
    const subjects = [
      subject('auto', 100, 100),
      subject('pinned', 100, 110, { pinnedCorner: 'ne' }),
    ];

    // Act
    const placed = placeLabels(subjects);

    // Assert
    expect(placed.get('pinned')).toBe('ne');
    expect(placed.get('auto')).not.toBe('ne');
  });

  it('picks the least-overlapping corner when every corner collides', () => {
    // Arrange
    const crowd = (['ne', 'nw', 'se', 'sw'] as Corner[]).map((c, i) =>
      subject(`p${i}`, 100, 100, { pinnedCorner: c }),
    );
    const subjects = [...crowd, subject('auto', 100, 100)];

    // Act
    const placed = placeLabels(subjects);

    // Assert
    expect(['ne', 'nw', 'se', 'sw']).toContain(placed.get('auto') ?? 'none');
  });
});
