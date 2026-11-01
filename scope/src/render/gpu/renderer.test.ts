import { describe, expect, it } from 'bun:test';

import type { BatchKind } from '../protocol';
import { LABEL_SLOTS, type SlotName } from '../slots';
import { drawSteps } from './renderer';

const held = (entries: [SlotName, BatchKind[]][]) =>
  new Map(entries.map(([slot, kinds]) => [slot, kinds.map((kind) => ({ kind }))]));

const isLabel = (slot: SlotName) => LABEL_SLOTS.includes(slot);

describe('drawSteps', () => {
  const slots = held([
    ['routeLines', ['lines']],
    ['ringLabels', ['text']],
    ['areaLabels', ['text']],
    ['routeLabels', ['lines', 'text']],
    ['pointLabels', ['text']],
    ['pointMarkers', ['markers']],
    ['targets', ['text']],
  ]);

  it('draws the halos of every label before any label glyph', () => {
    // Act
    const passes = drawSteps(slots)
      .filter((s) => isLabel(s.slot))
      .map((s) => s.pass);

    // Assert
    expect(passes.filter((pass) => pass === 'halo')).toHaveLength(LABEL_SLOTS.length);
    expect(passes.lastIndexOf('halo')).toBeLessThan(passes.indexOf('text'));
  });

  it('keeps every other batch in slot order, the lines of a label slot between its halos and glyphs', () => {
    // Arrange
    const expected = [
      'routeLines/0/lines',
      'ringLabels/0/halo',
      'areaLabels/0/halo',
      'routeLabels/1/halo',
      'pointLabels/0/halo',
      'ringLabels/0/text',
      'areaLabels/0/text',
      'routeLabels/0/lines',
      'routeLabels/1/text',
      'pointLabels/0/text',
      'pointMarkers/0/markers',
      'targets/0/text',
    ];

    // Act
    const steps = drawSteps(slots);

    // Assert
    expect(steps.map((s) => `${s.slot}/${s.index}/${s.pass}`)).toEqual(expected);
  });
});
