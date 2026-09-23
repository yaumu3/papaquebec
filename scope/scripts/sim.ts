/**
 * A stand-in tar1090 serving synthetic traffic, for working on the scope without a receiver:
 *
 *   bun scripts/sim.ts [--port 8090] [--site lat,lon] [--speed 1]
 *   PQ_TAR1090=http://localhost:8090 bun run dev
 *
 * `--speed` runs the sim faster than the wall clock, with receiver.json's refresh shortened to match.
 */
import { parseArgs } from 'node:util';

import { simHandler } from './sim/server';

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '8090' },
    site: { type: 'string', default: '35.5533,139.7811' }, // RJTT
    speed: { type: 'string', default: '1' },
  },
});
const [lat = 0, lon = 0] = values.site.split(',').map(Number);
const server = Bun.serve({
  port: Number(values.port),
  fetch: simHandler({ site: { lat, lon }, speed: Number(values.speed) }),
});
console.log(
  `sim receiver at ${server.url}data/aircraft.json, site ${lat}, ${lon}, speed ${values.speed}x`,
);
