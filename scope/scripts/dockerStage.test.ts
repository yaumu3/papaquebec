import { describe, expect, it } from 'bun:test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const REPO = join(import.meta.dir, '../..');

/** The files the Dockerfile's final stage copies from the scope, with where each lands. */
function finalStageFiles(dockerfile: string): { from: string; to: string }[] {
  const finalStage = dockerfile.slice(dockerfile.lastIndexOf('\nFROM '));
  return finalStage.split('\n').flatMap((line) => {
    const words = line.split(' ');
    const to = words.at(-1) ?? '';
    if (words[0] !== 'COPY' || words[1]?.startsWith('--from')) return [];
    return words
      .slice(1, -1)
      .filter((from) => from.startsWith('scope/'))
      .map((from) => ({ from, to: join(to, basename(from)) }));
  });
}

/** A directory holding only `files`, as the final stage lays them out. */
function stageOf(files: readonly { from: string; to: string }[]): string {
  const stage = mkdtempSync(join(tmpdir(), 'stage-'));
  for (const { from, to } of files) {
    mkdirSync(join(stage, to, '..'), { recursive: true });
    cpSync(join(REPO, from), join(stage, to));
  }
  return stage;
}

/** What a script says on stderr run in `stage`, with no site and no packages to fetch. */
function stderrOf(script: string, stage: string): string {
  const run = Bun.spawnSync(['bun', '--no-install', script], {
    cwd: stage,
    env: { PATH: process.env.PATH },
  });
  return run.stderr.toString();
}

describe('the final stage of the image', () => {
  it('holds all that the conversion scripts import: they run as far as asking for a site', () => {
    // Arrange
    const files = finalStageFiles(readFileSync(join(REPO, 'Dockerfile'), 'utf8'));
    const stage = stageOf(files);
    const scripts = ['scripts/build-coast.ts', 'scripts/build-mapset.ts'];

    // Act
    const said = scripts.map((script) => stderrOf(script, stage));
    rmSync(stage, { recursive: true });

    // Assert
    for (const stderr of said) expect(stderr).toContain('no site');
  });
});
