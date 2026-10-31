/** The coastline as shipped in `public/map/coast.json`: lines of lon/lat degrees. */
import { isNum, isRecord } from './guards';

export type LonLat = [number, number];

export interface CoastData {
  lines: LonLat[][];
}

const isPair = (v: unknown): v is LonLat => Array.isArray(v) && v.length === 2 && v.every(isNum);
const isLine = (v: unknown): v is LonLat[] => Array.isArray(v) && v.every(isPair);

export function parseCoast(raw: unknown): CoastData {
  if (isRecord(raw) && Array.isArray(raw.lines)) {
    return { lines: raw.lines.filter(isLine) };
  }
  throw new Error('coast.json: unexpected shape');
}
