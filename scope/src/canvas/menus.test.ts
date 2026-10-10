import { describe, expect, it } from 'bun:test';

import { makeTrack } from '../render/scene/trackFixture';
import { targetMenu } from './menus';

describe('targetMenu', () => {
  it('offers the target by its label, then select, copy hex and an RBL start', () => {
    // Arrange
    const t = makeTrack();

    // Act
    const items = targetMenu(t);

    // Assert
    expect(items.map((i) => i.label)).toEqual([
      'TEST01',
      'Select',
      'Copy hex',
      'Start RBL from here',
    ]);
  });
});
