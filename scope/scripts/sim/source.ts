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

/** `clock` returns sim seconds since epoch; `refresh` is what receiver.json advertises. */
export function createSimSource(
  site: Site,
  clock: () => number = () => Date.now() / 1000,
  refresh = 1000,
): SimSource {
  const state = FLEET.map((a) => Object.assign({ messages: 0 }, a));
  let lastTick = clock();
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
        a.alt = Math.max(0, a.alt + (a.baroRate * dt) / 60);
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
          alt_baro: Math.round(a.alt),
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
        return json;
      });
      return { now, messages, aircraft };
    },
  };
}
