/**
 * Fails on a crate in Cargo.lock younger than `registry.global-min-publish-age`, which stable Cargo
 * ignores before 1.100 and which never applies to what a lock already holds.
 */
import { isRecord } from '../map/guards';

const DAY_MS = 86_400_000;
const INDEX = 'https://index.crates.io';

export interface Crate {
  name: string;
  version: string;
}

interface Published extends Crate {
  published: number | undefined;
}

export const parseMinAge = (age: string): number => {
  const days = /^(\d+) days?$/.exec(age)?.[1];
  if (days === undefined) throw new Error(`cannot read the age "${age}"`);
  return Number(days) * DAY_MS;
};

export const registryCrates = (lock: string): Crate[] => {
  const { package: packages } = Bun.TOML.parse(lock) as { package?: unknown };
  if (!Array.isArray(packages)) throw new Error('the lock has no packages');
  return packages.flatMap((entry: unknown) =>
    isRecord(entry) &&
    typeof entry.source === 'string' &&
    entry.source.startsWith('registry+') &&
    typeof entry.name === 'string' &&
    typeof entry.version === 'string'
      ? [{ name: entry.name, version: entry.version }]
      : [],
  );
};

export const indexPath = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower.length <= 2) return `${lower.length}/${lower}`;
  if (lower.length === 3) return `3/${lower[0]}/${lower}`;
  return `${lower.slice(0, 2)}/${lower.slice(2, 4)}/${lower}`;
};

export const publishedAt = (index: string, version: string): number | undefined => {
  const entry = index
    .trim()
    .split('\n')
    .map((line): unknown => JSON.parse(line))
    .find((line) => isRecord(line) && line.vers === version);
  if (!isRecord(entry)) throw new Error(`the index does not list ${version}`);
  return typeof entry.pubtime === 'string' ? Date.parse(entry.pubtime) : undefined;
};

export const tooYoung = (crates: Published[], minAgeMs: number, now: number): Published[] =>
  crates.filter(({ published }) => published !== undefined && now - published < minAgeMs);

const withPublishTime = async ({ name, version }: Crate): Promise<Published> => {
  const response = await fetch(`${INDEX}/${indexPath(name)}`);
  if (!response.ok) throw new Error(`${name}: the index answered ${response.status}`);
  return { name, version, published: publishedAt(await response.text(), version) };
};

const readMinAge = async (): Promise<string> => {
  const config = await Bun.file(new URL('../../../.cargo/config.toml', import.meta.url)).text();
  const { registry } = Bun.TOML.parse(config) as { registry?: Record<string, unknown> };
  const age = registry?.['global-min-publish-age'];
  if (typeof age !== 'string') throw new Error('.cargo/config.toml sets no minimum age');
  return age;
};

const main = async (): Promise<void> => {
  const age = await readMinAge();
  const lock = await Bun.file(new URL('../../../Cargo.lock', import.meta.url)).text();
  const crates = await Promise.all(registryCrates(lock).map(withPublishTime));
  const held = tooYoung(crates, parseMinAge(age), Date.now());
  for (const { name, version, published } of held) {
    console.error(`${name} ${version}: published ${new Date(published ?? 0).toISOString()}`);
  }
  if (held.length > 0) throw new Error(`${held.length} crates are younger than ${age}`);
  console.log(`${crates.length} crates, none younger than ${age}`);
};

if (import.meta.main) await main();
