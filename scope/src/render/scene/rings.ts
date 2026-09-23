export function ringStepNm(rangeNm: number): number {
  if (rangeNm <= 20) return 5;
  if (rangeNm <= 80) return 10;
  return 20;
}

export function ringRadii(rangeNm: number): number[] {
  const step = ringStepNm(rangeNm);
  const out: number[] = [];
  for (let r = step; r <= rangeNm; r += step) out.push(r);
  return out;
}
