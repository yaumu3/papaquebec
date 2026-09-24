import type { Vec2 } from '../lib/geo';
import { nextRblTag, type Rbl, type RblAnchor } from '../state/scope';

/** The anchor a point on the scope stands for: the target under it, else the point itself. */
export function anchorFor(t: { hex: string } | null, world: Vec2): RblAnchor {
  return t ? { kind: 'target', hex: t.hex } : { kind: 'free', x: world.x, y: world.y };
}

/** The list with a line from `a` to `b` added, unless both ends are the same target. */
export function appendRbl(existing: readonly Rbl[], a: RblAnchor, b: RblAnchor): readonly Rbl[] {
  if (a.kind === 'target' && b.kind === 'target' && a.hex === b.hex) return existing;
  return [...existing, { a, b, tag: nextRblTag(existing) }];
}
