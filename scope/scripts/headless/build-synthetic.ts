/**
 * Writes the synthetic national-scale map set to a file, to import into a dev server by hand.
 *
 *   bun scripts/headless/build-synthetic.ts --out synthetic.mapset.geojson
 *     [--scale 1] [--seed 1] [--site lat,lon]
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { resolveSite } from '../map/site';
import { syntheticMapSet } from './synthetic';

const { values: opt } = parseArgs({
  options: {
    out: { type: 'string' },
    scale: { type: 'string', default: '1' },
    seed: { type: 'string', default: '1' },
    site: { type: 'string', default: '35.5533,139.7811' }, // RJTT
  },
});

if (!opt.out) throw new Error('--out names the file to write');
const { data } = syntheticMapSet({
  site: resolveSite(opt.site.split(','), {}),
  scale: Number(opt.scale),
  seed: Number(opt.seed),
});
writeFileSync(opt.out, JSON.stringify(data));
console.log(`${data.features.length} features -> ${opt.out}`);
