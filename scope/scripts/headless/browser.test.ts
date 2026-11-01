import { afterEach, describe, expect, it } from 'bun:test';

import { stoppedOnFailure, untilUp } from './browser';

/** Nothing listens there, so every ask is refused at once. */
const CLOSED = 'http://127.0.0.1:1/';

/** How a promise ended, to assert on once it has. */
const settled = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }),
  );

describe('untilUp', () => {
  const servers: { stop: () => void }[] = [];
  afterEach(() => servers.splice(0).forEach((server) => server.stop()));

  it('resolves once the server answers', async () => {
    // Arrange
    const server = Bun.serve({ port: 0, fetch: () => new Response('up') });
    servers.push(server);

    // Act
    const up = await settled(untilUp(server.url.href, 5));

    // Assert
    expect(up).toEqual({ value: undefined });
  });

  it('gives up when the server never answers', async () => {
    // Arrange
    const tries = 2;

    // Act
    const up = await settled(untilUp(CLOSED, tries));

    // Assert
    expect(up).toEqual({ error: `${CLOSED} did not answer` });
  });

  it('gives up as soon as the server has stopped', async () => {
    // Arrange
    let checks = 0;
    const running = () => {
      checks += 1;
      return false;
    };

    // Act
    const up = await settled(untilUp(CLOSED, 1000, running));

    // Assert
    expect(up).toEqual({ error: `the server for ${CLOSED} stopped` });
    expect(checks).toBe(1);
  });
});

describe('stoppedOnFailure', () => {
  it('stops what was started when what follows fails', async () => {
    // Arrange
    let stops = 0;
    const stop = () => {
      stops += 1;
    };

    // Act
    const opened = await settled(
      stoppedOnFailure(stop, () => Promise.reject(new Error('no page'))),
    );

    // Assert
    expect(opened).toEqual({ error: 'no page' });
    expect(stops).toBe(1);
  });

  it('leaves it running when what follows succeeds', async () => {
    // Arrange
    let stops = 0;
    const stop = () => {
      stops += 1;
    };

    // Act
    const opened = await settled(stoppedOnFailure(stop, () => Promise.resolve('page')));

    // Assert
    expect(opened).toEqual({ value: 'page' });
    expect(stops).toBe(0);
  });
});
