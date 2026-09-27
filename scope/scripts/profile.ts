/**
 * Reads a DevTools protocol CPU profile for a few named functions, so a benchmark can time scene
 * code from outside the page. Names only survive an unminified build.
 */

/** The parts of a `Profiler.Profile` read here. */
export interface CpuProfile {
  nodes: { id: number; callFrame: { functionName: string }; children?: number[] }[];
  samples?: number[];
  /** Microseconds from the previous sample to this one. */
  timeDeltas?: number[];
}

/**
 * Sampled time inside each named function, callees included, in ms. A sample lasts until the
 * next one, and counts once per function however deep it recurses.
 */
export function inclusiveMs(profile: CpuProfile, names: readonly string[]): Map<string, number> {
  const out = new Map(names.map((n) => [n, 0]));
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  samples.forEach((id, i) => {
    const ms = (deltas[i + 1] ?? 0) / 1000;
    const seen = new Set<string>();
    for (let at: number | undefined = id; at !== undefined; at = parent.get(at)) {
      const name = byId.get(at)?.callFrame.functionName ?? '';
      if (out.has(name)) seen.add(name);
    }
    for (const name of seen) out.set(name, (out.get(name) ?? 0) + ms);
  });
  return out;
}
