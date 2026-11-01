import { describe, expect, it } from 'bun:test';

import type { BatchKind } from './protocol';
import { drawSteps, LABEL_SLOTS, type SlotName } from './slots';

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
    // Arrange
    const labelled = LABEL_SLOTS.filter((slot) => slots.has(slot));

    // Act
    const steps = drawSteps(slots);

    // Assert
    const passes = steps.filter((s) => isLabel(s.slot)).map((s) => s.pass);
    expect(passes.filter((pass) => pass === 'halo')).toHaveLength(labelled.length);
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

  it('rims the text of a highlight just before its glyphs, over what the slot drew first', () => {
    // Arrange
    const highlighted = held([
      ['traces', ['lines', 'markers', 'text', 'lines']],
      ['tracedPoints', ['markers', 'text']],
      ['targets', ['text']],
    ]);
    const expected = [
      'traces/0/lines',
      'traces/1/markers',
      'traces/2/halo',
      'traces/2/text',
      'traces/3/lines',
      'tracedPoints/0/markers',
      'tracedPoints/1/halo',
      'tracedPoints/1/text',
      'targets/0/text',
    ];

    // Act
    const steps = drawSteps(highlighted);

    // Assert
    expect(steps.map((s) => `${s.slot}/${s.index}/${s.pass}`)).toEqual(expected);
  });
});
