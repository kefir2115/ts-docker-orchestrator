import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startService } from '../src/microservice.js';

test('auto-picks a free port and serves a JSON handler result', async () => {
  const { port, server } = await startService({ name: 'json-demo', handler: () => ({ ok: true }) });
  assert.ok(port > 0);

  const res = await fetch(`http://localhost:${port}/`);
  assert.deepEqual(await res.json(), { ok: true });

  await new Promise((resolve) => server.close(resolve));
});

test('uses the declared port instead of picking one', async () => {
  const { port, server } = await startService({
    name: 'fixed-port',
    port: 41234,
    handler: () => 'hi',
  });
  assert.equal(port, 41234);

  const res = await fetch('http://localhost:41234/');
  assert.equal(await res.json(), 'hi');

  await new Promise((resolve) => server.close(resolve));
});

test('lets the handler return a raw Response', async () => {
  const { port, server } = await startService({
    name: 'raw-response',
    handler: () => new Response('plain text', { status: 202 }),
  });

  const res = await fetch(`http://localhost:${port}/`);
  assert.equal(res.status, 202);
  assert.equal(await res.text(), 'plain text');

  await new Promise((resolve) => server.close(resolve));
});

test('awaits an async handler', async () => {
  const { port, server } = await startService({
    name: 'async-handler',
    handler: async () => {
      await new Promise((r) => setTimeout(r, 5));
      return { delayed: true };
    },
  });

  const res = await fetch(`http://localhost:${port}/`);
  assert.deepEqual(await res.json(), { delayed: true });

  await new Promise((resolve) => server.close(resolve));
});

test('serves multiple named endpoints via routes', async () => {
  const { port, server } = await startService({
    name: 'multi-route',
    routes: {
      '/status': () => ({ ok: true }),
      '/ping': () => 'pong',
    },
  });

  const status = await fetch(`http://localhost:${port}/status`);
  assert.deepEqual(await status.json(), { ok: true });

  const ping = await fetch(`http://localhost:${port}/ping`);
  assert.equal(await ping.json(), 'pong');

  const missing = await fetch(`http://localhost:${port}/nope`);
  assert.equal(missing.status, 404);

  await new Promise((resolve) => server.close(resolve));
});

test('throws when neither handler nor routes is given', async () => {
  await assert.rejects(
    () => startService({ name: 'empty' }),
    /pass a "handler" or "routes"/,
  );
});
