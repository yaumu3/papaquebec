import type { AircraftJson, AircraftSnapshot, ReceiverJson } from '../lib/aircraft';
import { isRecord } from '../lib/guards';

function isAircraft(a: unknown): a is AircraftJson {
  return isRecord(a) && typeof a.hex === 'string';
}

/** Shape check for `aircraft.json`. Fields beyond the contract pass through untouched. */
export function parseSnapshot(raw: unknown): AircraftSnapshot {
  if (
    isRecord(raw) &&
    typeof raw.now === 'number' &&
    typeof raw.messages === 'number' &&
    Array.isArray(raw.aircraft)
  ) {
    const aircraft: unknown[] = raw.aircraft;
    if (aircraft.every(isAircraft)) {
      return { ...raw, now: raw.now, messages: raw.messages, aircraft };
    }
  }
  throw new Error('aircraft.json: unexpected shape');
}

export function parseReceiver(raw: unknown): ReceiverJson {
  if (isRecord(raw)) return raw;
  throw new Error('receiver.json: unexpected shape');
}
