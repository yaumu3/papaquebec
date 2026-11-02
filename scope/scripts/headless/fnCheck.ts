/**
 * Whether the names given to the profiler each mean one function. A name that matches nothing
 * would report 0 ms and read as free, and a sampled profile lists only what ran while recording,
 * so the names are checked against the built JS.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The declarations of `name`, among them a duplicate the bundler renamed by a number. */
const declarations = (name: string, bundle: string): number =>
  bundle.match(new RegExp(`\\bfunction\\*?\\s+${name}(?:\\$?\\d+)?\\s*\\(`, 'g'))?.length ?? 0;

/** What is wrong with each of `names` that does not name exactly one function of `bundle`. */
export function fnProblems(names: readonly string[], bundle: string): string[] {
  return names.flatMap((name) => {
    const count = declarations(name, bundle);
    if (count === 1) return [];
    return count === 0
      ? [`${name}: no function has this name`]
      : [`${name}: ${count} functions have this name`];
  });
}

/** Every script of the build, as one text. */
export const bundleIn = (dist: string): string =>
  readdirSync(join(dist, 'assets'))
    .filter((file) => file.endsWith('.js'))
    .map((file) => readFileSync(join(dist, 'assets', file), 'utf8'))
    .join('\n');
