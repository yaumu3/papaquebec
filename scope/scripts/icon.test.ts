import { describe, expect, it } from 'bun:test';

import { ICON_16, ICON_MASTER, iconGeometry, iconSvg } from './icon';

describe('iconGeometry', () => {
  it('turns left through the headings and places the marks and target', () => {
    // Arrange
    const arts = [ICON_MASTER, ICON_16];

    // Act
    const placed = arts.map((art) => {
      const { marks, target } = iconGeometry(art);
      return [...marks, target].map((p) => [
        Math.round(p.heading),
        Number(p.x.toFixed(2)),
        Number(p.y.toFixed(2)),
      ]);
    });

    // Assert
    expect(placed).toEqual([
      [
        [351, 47.54, 48.81],
        [332, 43.05, 35.35],
        [310, 34.18, 24.29],
        [279, 17.97, 16.69],
      ],
      [
        [351, 48.69, 50.04],
        [333, 44.32, 36.53],
        [313, 35.77, 25.21],
        [279, 17.51, 16.17],
      ],
    ]);
  });
});

describe('iconSvg', () => {
  it('draws the tile, target and three fixed-tilt slashes in the two scope colours', () => {
    // Arrange
    const art = ICON_MASTER;

    // Act
    const svg = iconSvg(art, 12);

    // Assert
    expect(svg).toContain('<rect width="64" height="64" rx="12" fill="#2a2a2a"/>');
    expect(svg).toContain('<rect x="10.97" y="9.69" width="14" height="14" fill="#8ac060"/>');
    expect(svg.match(/<line /g)).toHaveLength(3);
    expect(svg).toContain(
      '<line x1="43.21" y1="53.14" x2="51.86" y2="44.49" stroke="#8ac060" stroke-width="3.3" stroke-linecap="butt"/>',
    );
    expect(svg).not.toMatch(/#(?!2a2a2a|8ac060)[0-9a-f]{6}/);
  });

  it('omits the corner radius for the square tile', () => {
    // Arrange
    const art = ICON_MASTER;

    // Act
    const svg = iconSvg(art, 0);

    // Assert
    expect(svg).toContain('<rect width="64" height="64" rx="0" fill="#2a2a2a"/>');
  });
});
