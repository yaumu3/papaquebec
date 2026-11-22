/** The step after this one; the first after the last, and after one the list lacks. */
export function cycle<T>(steps: readonly [T, ...T[]], current: T): T {
  return steps[steps.indexOf(current) + 1] ?? steps[0];
}
