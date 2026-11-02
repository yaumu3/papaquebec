import { describe, expect, test } from 'bun:test';

import { indexPath, parseMinAge, publishedAt, registryCrates, tooYoung } from './age';

const DAY_MS = 86_400_000;

const crate = (published: number | undefined) => ({ name: 'x', version: '1.0.0', published });

describe('parseMinAge', () => {
  test('reads the days of a Cargo age', () => {
    // Arrange
    const age = '3 days';

    // Act
    const ms = parseMinAge(age);

    // Assert
    expect(ms).toBe(3 * DAY_MS);
  });

  test('refuses what it cannot read, rather than letting everything through', () => {
    // Arrange
    const age = '3 fortnights';

    // Act
    const parse = () => parseMinAge(age);

    // Assert
    expect(parse).toThrow('3 fortnights');
  });
});

describe('registryCrates', () => {
  test('keeps crates from a registry, and leaves out the workspace', () => {
    // Arrange
    const lock = `
version = 4

[[package]]
name = "serde"
version = "1.0.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "00"

[[package]]
name = "placer"
version = "0.1.0"
`;

    // Act
    const crates = registryCrates(lock);

    // Assert
    expect(crates).toEqual([{ name: 'serde', version: '1.0.0' }]);
  });

  test('refuses a lock with nothing in it, which would otherwise pass', () => {
    // Arrange
    const lock = 'version = 4';

    // Act
    const read = () => registryCrates(lock);

    // Assert
    expect(read).toThrow('no packages');
  });
});

describe('indexPath', () => {
  test('lays names out as the sparse index does', () => {
    // Arrange
    const names = ['a', 'ab', 'abc', 'abcd', 'Serde_JSON'];

    // Act
    const paths = names.map(indexPath);

    // Assert
    expect(paths).toEqual(['1/a', '2/ab', '3/a/abc', 'ab/cd/abcd', 'se/rd/serde_json']);
  });
});

describe('publishedAt', () => {
  const index = [
    '{"name":"x","vers":"1.0.0"}',
    '{"name":"x","vers":"1.1.0","pubtime":"2026-10-30T06:15:04Z"}',
  ].join('\n');

  test('reads the publish time of the locked version', () => {
    // Arrange
    const version = '1.1.0';

    // Act
    const time = publishedAt(index, version);

    // Assert
    expect(time).toBe(Date.parse('2026-10-30T06:15:04Z'));
  });

  test('has no time for a version older than the field', () => {
    // Arrange
    const version = '1.0.0';

    // Act
    const time = publishedAt(index, version);

    // Assert
    expect(time).toBeUndefined();
  });

  test('refuses a version the index does not list', () => {
    // Arrange
    const version = '9.9.9';

    // Act
    const read = () => publishedAt(index, version);

    // Assert
    expect(read).toThrow('9.9.9');
  });
});

describe('tooYoung', () => {
  const now = Date.parse('2026-11-02T00:00:00Z');

  test('holds back a crate younger than the age, and passes one exactly that old', () => {
    // Arrange
    const young = crate(now - 3 * DAY_MS + 1);
    const old = crate(now - 3 * DAY_MS);

    // Act
    const held = tooYoung([young, old], 3 * DAY_MS, now);

    // Assert
    expect(held).toEqual([young]);
  });

  test('passes a crate with no publish time, as Cargo does', () => {
    // Arrange
    const undated = crate(undefined);

    // Act
    const held = tooYoung([undated], 3 * DAY_MS, now);

    // Assert
    expect(held).toEqual([]);
  });
});
