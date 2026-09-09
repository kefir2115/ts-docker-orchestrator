import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docker } from '../src/docker.js';

test('connects to the docker socket', () => {
  const modem = docker.modem as unknown as { socketPath: string };
  assert.equal(modem.socketPath, '/var/run/docker.sock');
});

test('the daemon actually answers on that socket', async () => {
  const pong = await docker.ping();
  assert.equal(pong.toString(), 'OK');
});
