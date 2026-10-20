import { describe, expect, it } from 'bun:test';

import { addMenuAnchor, clickSourceOf, paletteBox } from './menu';

describe('clickSourceOf', () => {
  it('tells a click made with the keyboard from one made with a pointer', () => {
    // Arrange
    const clicks = [0, 1, 2];

    // Act
    const sources = clicks.map(clickSourceOf);

    // Assert
    expect(sources).toEqual(['keyboard', 'pointer', 'pointer']);
  });
});

describe('addMenuAnchor', () => {
  it("opens upward from the click, or from the button's top-left when it is pressed with a key", () => {
    // Arrange
    const button = { left: 40, top: 300, right: 340, bottom: 324 };
    const rows: ['pointer' | 'keyboard', number, number][] = [
      ['pointer', 100, 310],
      ['keyboard', 0, 0],
    ];

    // Act
    const anchors = rows.map(([source, x, y]) => addMenuAnchor(source, x, y, button));

    // Assert
    expect(anchors).toEqual([
      { x: 100, y: 310, up: true },
      { x: 40, y: 300, up: true },
    ]);
  });
});

describe('paletteBox', () => {
  it('stands at the anchor where there is room, flips to the other side at an edge, and stays on screen', () => {
    // Arrange
    const size = { width: 200, height: 150 };
    const view = { width: 1000, height: 800 };
    const small = { width: 1000, height: 100 };
    const cases = [
      { anchor: { x: 100, y: 100, up: false }, view },
      { anchor: { x: 900, y: 100, up: false }, view },
      { anchor: { x: 100, y: 700, up: false }, view },
      { anchor: { x: 100, y: 400, up: true }, view },
      { anchor: { x: 100, y: 100, up: true }, view },
      { anchor: { x: 900, y: 700, up: true }, view },
      { anchor: { x: 100, y: 75, up: false }, view: small },
    ];

    // Act
    const boxes = cases.map((c) => paletteBox(c.anchor, size, c.view));

    // Assert
    expect(boxes).toEqual([
      { left: 100, top: 100 },
      { left: 700, top: 100 },
      { left: 100, top: 550 },
      { left: 100, top: 250 },
      { left: 100, top: 100 },
      { left: 700, top: 550 },
      { left: 100, top: 0 },
    ]);
  });
});
