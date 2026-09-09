import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docker } from '../src/docker.js';
import { ensureNetwork, NETWORK_NAME } from '../src/network.js';

test('creates the network once and reuses it on later calls', async () => {
  const id1 = await ensureNetwork();
  const id2 = await ensureNetwork();
  assert.equal(id1, id2);

  const nets = await docker.listNetworks({ filters: JSON.stringify({ name: [NETWORK_NAME] }) });
  assert.equal(nets.filter((n) => n.Name === NETWORK_NAME).length, 1);
});
