import { describe, expect, it } from 'bun:test';

import { NE } from '../../lib/datablock';
import { type LabelSubject, placeLabels } from './labels';

function subject(
  hex: string,
  cx: number,
  cy: number,
  extra: Partial<LabelSubject> = {},
): LabelSubject {
  return { hex, cx, cy, extraLines: 0, dir: null, ...extra };
}

describe('placeLabels', () => {
  it('leaves an uncontested block in its current direction', () => {
    // Arrange
    const subjects = [subject('a', 100, 100, { dir: 3 })];

    // Act
    const placed = placeLabels(subjects);

    // Assert
    expect(placed.get('a')).toBe(3);
  });

  it('moves the lower of two colliding blocks to a free direction', () => {
    // Arrange
    const subjects = [subject('upper', 100, 100), subject('lower', 100, 110)];

    // Act
    const placed = placeLabels(subjects);

    // Assert
    expect(placed.get('upper')).toBe(NE);
    expect(placed.get('lower')).not.toBe(NE);
  });

  it('leaves a block where a drag put it until it collides', () => {
    // Arrange
    const subjects = [subject('upper', 100, 100, { dir: 2 }), subject('lower', 100, 110)];

    // Act
    const placed = placeLabels(subjects);

    // Assert
    expect(placed.get('upper')).toBe(2);
    expect(placed.get('lower')).not.toBe(2);
  });
});
