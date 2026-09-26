import { describe, expect, it } from 'bun:test';

import { type HeadingSelection, steeringHeading } from './autopilot';

describe('steeringHeading', () => {
  it('keeps the selected heading only while the heading bug steers the aircraft', () => {
    // Arrange
    const cases: HeadingSelection[] = [
      { selHeading: 160, navModes: ['autopilot', 'vnav'] },
      { selHeading: 291, navModes: undefined },
      { selHeading: 83, navModes: ['autopilot', 'vnav', 'lnav'] },
      { selHeading: 337, navModes: ['approach'] },
      { selHeading: 0, navModes: undefined }, // A320 family, managed NAV
      { selHeading: 0, navModes: ['autopilot'] },
      { selHeading: undefined, navModes: ['autopilot'] },
    ];

    // Act
    const out = cases.map(steeringHeading);

    // Assert
    expect(out).toEqual([160, 291, undefined, undefined, undefined, 0, undefined]);
  });
});
