import { describe, expect, it } from 'bun:test';

import { THEME } from '../render/scene/rules';
import { PALETTE } from './palette';

/** `--color-<name>: <value>;` declarations in the design tokens. */
async function cssColors(): Promise<Record<string, string>> {
  const css = await Bun.file(new URL('./tokens.css', import.meta.url)).text();
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/--color-([a-z-]+):\s*([^;]+);/g))
    out[m[1] ?? ''] = (m[2] ?? '').trim();
  return out;
}

describe('design tokens', () => {
  it('declares every palette color in tokens.css with the same value', async () => {
    // Arrange
    const expected = Object.entries(PALETTE);

    // Act
    const css = await cssColors();

    // Assert
    expect(expected.length).toBeGreaterThan(0);
    for (const [name, value] of expected) expect(css[name]).toBe(value);
  });

  it('feeds the canvas theme from the same palette', () => {
    // Arrange
    const pairs: [string, string][] = [
      [THEME.bg, PALETTE.bg],
      [THEME.level, PALETTE.level],
      [THEME.climb, PALETTE.climb],
      [THEME.descend, PALETTE.descend],
      [THEME.stale, PALETTE.stale],
      [THEME.selected, PALETTE.selected],
      [THEME.selbox, PALETTE.selbox],
      [THEME.emergency, PALETTE.emergency],
    ];

    // Act
    const mismatched = pairs.filter(([a, b]) => a !== b);

    // Assert
    expect(mismatched).toEqual([]);
  });
});
