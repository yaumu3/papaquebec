/**
 * Writes the JSON Schema for `aero.json` to `public/aero.schema.json`, served beside the
 * scope so an external file can point its `$schema` at it. Runs before every build.
 */
import { writeFileSync } from 'node:fs';

import { aeroJsonSchema } from './schema';

const OUT = 'public/aero.schema.json';

writeFileSync(OUT, JSON.stringify(aeroJsonSchema(), null, 1) + '\n');
console.log(`aero.json schema -> ${OUT}`);
