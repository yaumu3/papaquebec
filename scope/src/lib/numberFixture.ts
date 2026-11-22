import fc from 'fast-check';

/** A number from `min` to `max`, as likely in one part as another: `fc.double` crowds the ends and zero. */
export const anyBetween = (min: number, max: number): fc.Arbitrary<number> =>
  fc.integer({ min: 0, max: 1e6 }).map((n) => min + ((max - min) * n) / 1e6);
