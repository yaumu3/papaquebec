/** Shape guards for JSON read from the network or storage. */
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;
export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
