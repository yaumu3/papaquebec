/** Synthesized traffic around a site, shaped like readsb's `aircraft.json`. */
import type { AircraftJson, AircraftSnapshot, ReceiverJson } from '../../src/lib/aircraft';
import { FLEET } from './fleet';

export interface Site {
  lat: number;
  lon: number;
}

export interface SimSource {
  receiver(): ReceiverJson;
  poll(): AircraftSnapshot;
}

const RAD = Math.PI / 180;
/** Beyond this the aircraft is reflected back through the site so the sim never empties. */
const BOUNDS_NM = 55;
/** Sim seconds a crew takes to start toward a newly set level, and holds a level before the next. */
const SET_DELAY_SEC = 20;
const HOLD_SEC = 60;

interface Vertical {
  alt: number;
  baroRate: number;
  selAlt?: number;
  /** Level the aircraft started at; it is set again once the selected level has been held. */
  from: number;
  /** Climb or descent rate magnitude, fpm. */
  rate: number;
  /** Sim time the current selected level was set or reached. */
  since: number;
}

/** Levels off on reaching the selected level, holds it, then sets the level it came from. */
function flyLevel(a: Vertical, now: number, dt: number): void {
  a.alt = Math.max(0, a.alt + (a.baroRate * dt) / 60);
  if (a.selAlt === undefined) return;
  if (a.baroRate * (a.selAlt - a.alt) < 0) {
    a.alt = a.selAlt;
    a.baroRate = 0;
    a.since = now;
  } else if (a.baroRate === 0 && a.alt !== a.selAlt && now - a.since >= SET_DELAY_SEC) {
    a.baroRate = Math.sign(a.selAlt - a.alt) * a.rate;
  } else if (a.alt === a.selAlt && a.from !== a.selAlt && now - a.since >= HOLD_SEC) {
    [a.selAlt, a.from] = [a.from, a.selAlt];
    a.since = now;
  }
}

/** `clock` returns sim seconds since epoch; `refresh` is what receiver.json advertises. */
export function createSimSource(
  site: Site,
  clock: () => number = () => Date.now() / 1000,
  refresh = 1000,
): SimSource {
  let lastTick = clock();
  const state = FLEET.map((a) =>
    Object.assign(
      { messages: 0, from: a.alt, rate: Math.abs(a.baroRate) || 1000, since: lastTick },
      a,
    ),
  );
  let messages = 0;
  const cosLat = Math.cos(site.lat * RAD);
  const toGeo = (x: number, y: number) => ({
    lat: site.lat + y / 60,
    lon: site.lon + x / (60 * cosLat),
  });

  return {
    receiver: () => ({ lat: site.lat, lon: site.lon, refresh }),
    poll() {
      const now = clock();
      const dt = Math.max(0, now - lastTick);
      lastTick = now;
      for (const a of state) {
        const d = (a.gs * dt) / 3600;
        a.x += d * Math.sin(a.track * RAD);
        a.y += d * Math.cos(a.track * RAD);
        flyLevel(a, now, dt);
        if (Math.hypot(a.x, a.y) > BOUNDS_NM) {
          a.x = -a.x * 0.9;
          a.y = -a.y * 0.9;
        }
        a.messages += 2 * dt;
      }
      messages += 12 * dt;
      const aircraft: AircraftJson[] = state.map((a) => {
        const { lat, lon } = toGeo(a.x, a.y);
        const json: AircraftJson = {
          hex: a.hex,
          category: a.category,
          squawk: a.squawk,
          lat,
          lon,
          alt_baro: a.ground ? 'ground' : Math.round(a.alt),
          gs: a.gs,
          track: a.track,
          baro_rate: a.baroRate,
          nic: 8,
          nac_p: 9,
          messages: a.messages,
          seen: 0.3,
          seen_pos: 0.3,
          t: a.type,
          r: a.reg,
        };
        if (a.flight) json.flight = `${a.flight} `;
        if (a.mlat) json.mlat = ['lat', 'lon', 'track', 'gs'];
        if (a.selAlt !== undefined) {
          json.nav_altitude_mcp = a.selAlt;
          json.nav_qnh = 1013.6;
        }
        if (a.selHeading !== undefined) json.nav_heading = a.selHeading;
        if (a.modes) json.nav_modes = a.modes;
        return json;
      });
      return { now, messages, aircraft };
    },
  };
}
