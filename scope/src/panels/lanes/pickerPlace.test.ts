import { describe, expect, it } from 'bun:test';

import {
  addPickerAnchor,
  clickSourceOf,
  contextSourceOf,
  isPickerKey,
  lanePickerAnchor,
  pickerBox,
} from './pickerPlace';

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

describe('addPickerAnchor', () => {
  it("opens upward from the click, or from the button's top-left when it is pressed with a key", () => {
    // Arrange
    const button = { left: 40, top: 300, right: 340, bottom: 324 };
    const rows: ['pointer' | 'keyboard', number, number][] = [
      ['pointer', 100, 310],
      ['keyboard', 0, 0],
    ];

    // Act
    const anchors = rows.map(([source, x, y]) => addPickerAnchor(source, x, y, button));

    // Assert
    expect(anchors).toEqual([
      { x: 100, y: 310, up: true },
      { x: 40, y: 300, up: true },
    ]);
  });
});

describe('contextSourceOf', () => {
  it('tells a picker asked for with the keyboard, a finger held down, or a mouse or pen', () => {
    // Arrange
    const events: [number, string | null][] = [
      [-1, null],
      [-1, 'touch'],
      [2, 'mouse'],
      [2, 'pen'],
      [0, 'touch'],
      [2, 'touch'],
      [2, null],
    ];

    // Act
    const sources = events.map(([button, pressed]) => contextSourceOf(button, pressed));

    // Assert
    expect(sources).toEqual(['keyboard', 'keyboard', 'mouse', 'mouse', 'touch', 'touch', 'mouse']);
  });
});

describe('lanePickerAnchor', () => {
  it("opens at the pointer, at the lane's top-left from the keyboard, and not at all for a finger", () => {
    // Arrange
    const lane = { left: 40, top: 300, right: 380, bottom: 385 };
    const rows: ['mouse' | 'touch' | 'keyboard', number, number][] = [
      ['mouse', 100, 310],
      ['keyboard', 0, 0],
      ['touch', 100, 310],
    ];

    // Act
    const anchors = rows.map(([source, x, y]) => lanePickerAnchor(source, x, y, lane));

    // Assert
    expect(anchors).toEqual([{ x: 100, y: 310, up: false }, { x: 40, y: 300, up: false }, null]);
  });
});

describe('isPickerKey', () => {
  it('is Shift+F10, which the keyboard asks for a picker with where no menu key stands', () => {
    // Arrange
    const keys = [
      { key: 'F10', shiftKey: true },
      { key: 'F10', shiftKey: false },
      { key: 'F9', shiftKey: true },
    ];

    // Act
    const flags = keys.map(isPickerKey);

    // Assert
    expect(flags).toEqual([true, false, false]);
  });
});

describe('pickerBox', () => {
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
    const boxes = cases.map((c) => pickerBox(c.anchor, size, c.view));

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
