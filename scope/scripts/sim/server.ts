/** The two tar1090 endpoints the scope reads, answered from the sim. */
import { createSimSource, type Site } from './source';

export interface SimOptions {
  site: Site;
  /** Sim seconds per wall second. */
  speed: number;
}

/** A clock in sim seconds that runs `speed` times faster than the wall. */
export function simClock(speed: number, wallMs: () => number = Date.now): () => number {
  const start = wallMs();
  return () => (start + (wallMs() - start) * speed) / 1000;
}

/** One request handler: the same for a Bun server and for a Playwright route. */
export function simHandler(opts: SimOptions): (req: Request) => Response {
  const refresh = Math.round(1000 / opts.speed);
  const source = createSimSource(opts.site, simClock(opts.speed), refresh);
  return (req) => {
    const { pathname } = new URL(req.url);
    if (pathname === '/data/receiver.json') return Response.json(source.receiver());
    if (pathname === '/data/aircraft.json') return Response.json(source.poll());
    return new Response('not found', { status: 404 });
  };
}
