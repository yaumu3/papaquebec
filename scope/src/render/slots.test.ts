import { describe, expect, it } from 'bun:test';

import fc from 'fast-check';

import type { BatchKind } from './protocol';
import { drawSteps, LABEL_SLOTS, SLOT_ORDER, type SlotName } from './slots';

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
    // Arrange: any slots held, each with a few batches of any kind
    const anyKinds = fc.array(fc.constantFrom<BatchKind>('lines', 'markers', 'text'), {
      maxLength: 3,
    });
    const anyHeld = fc
      .array(fc.tuple(fc.constantFrom(...SLOT_ORDER), anyKinds))
      .map((entries) => held(entries));

    fc.assert(
      fc.property(anyHeld, (heldSlots) => {
        // Act
        const steps = drawSteps(heldSlots);

        // Assert: a halo for each glyph batch of the labels, and no glyph batch before the last of them
        const ofLabels = steps.filter((s) => isLabel(s.slot));
        const batches = (pass: string) =>
          ofLabels.filter((s) => s.pass === pass).map((s) => `${s.slot}/${s.index}`);
        const passes = ofLabels.map((s) => s.pass).filter((pass) => pass !== 'lines');
        expect(batches('halo')).toEqual(batches('text'));
        expect(passes.slice(0, batches('halo').length)).not.toContain('text');
      }),
    );
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

  it("keeps a lit gap under the chart's symbols, and a traced symbol over them", () => {
    // Arrange
    const lit = held([
      ['tracedPoints', ['markers']],
      ['pointMarkers', ['markers']],
      ['traces', ['lines']],
    ]);

    // Act
    const steps = drawSteps(lit);

    // Assert
    expect(steps.map((step) => step.slot)).toEqual(['traces', 'pointMarkers', 'tracedPoints']);
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
