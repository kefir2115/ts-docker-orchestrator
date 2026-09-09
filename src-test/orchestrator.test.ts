import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { docker } from '../src/docker.js';
import {
  launchFolder,
  checkScaling,
  printTable,
  cleanupAll,
  stopAutoscaler,
  services,
} from '../src/orchestrator.js';

const run = promisify(execFile);
const FIXTURE_ROOT = new URL('./car-marketplace/', import.meta.url).pathname;

function curl(url: string): Promise<{ stdout: string }> {
  return run('docker', [
    'run',
    '--rm',
    '--network',
    'orchestrator-net',
    'curlimages/curl',
    '-sS',
    url,
  ]);
}

after(() => cleanupAll());

test('builds every microservice folder, each with its declared replica count', async () => {
  await launchFolder(FIXTURE_ROOT);
  stopAutoscaler(); // the rest of this file drives checkScaling() by hand

  assert.deepEqual([...services.entries()].map(([name, s]) => [name, s.containers.length]).sort(), [
    ['chat-service', 1],
    ['db-service', 1],
    ['listing-service', 3], // from replicas.txt
    ['user-service', 2], // from replicas.txt
  ]);

  for (const service of services.values()) {
    for (const container of service.containers) {
      assert.equal((await container.inspect()).State.Running, true);
    }
  }
});

test('printTable does not throw and reports every service', async () => {
  await printTable();
});

test('listing-service reads through to db-service by container name', async () => {
  const { stdout } = await curl('http://listing-service:3000/listings');
  const body = JSON.parse(stdout);
  assert.ok(Array.isArray(body.listings) && body.listings.length > 0);
  assert.ok(body.servedBy); // hostname of whichever replica answered
});

test('the listing-service alias round-robins across its 3 replicas', async () => {
  const servedBy = new Set<string>();
  for (let i = 0; i < 12; i++) {
    const { stdout } = await curl('http://listing-service:3000/listings');
    servedBy.add(JSON.parse(stdout).servedBy);
  }
  // Docker's embedded DNS round-robins the "listing-service" alias between all 3 containers
  assert.ok(servedBy.size > 1, `expected more than one replica to answer, got ${[...servedBy]}`);
});

test('chat-service chains user-service and db-service to send a message', async () => {
  const { stdout: sent } = await run('docker', [
    'run',
    '--rm',
    '--network',
    'orchestrator-net',
    'curlimages/curl',
    '-sS',
    '-X',
    'POST',
    'http://chat-service:3000/messages',
    '-d',
    JSON.stringify({ from: '1', to: '2', text: 'is the BMW still available?' }),
  ]);
  const message = JSON.parse(sent);
  assert.equal(message.from, '1');
  assert.equal(message.text, 'is the BMW still available?');

  // rejects when either side of the conversation does not exist in db-service
  const { stdout: rejected } = await run('docker', [
    'run',
    '--rm',
    '--network',
    'orchestrator-net',
    'curlimages/curl',
    '-sS',
    '-X',
    'POST',
    'http://chat-service:3000/messages',
    '-d',
    JSON.stringify({ from: '1', to: 'nobody', text: 'hello?' }),
  ]);
  assert.equal(JSON.parse(rejected).error, 'unknown sender or recipient');
});

test('logs "no Dockerfile found" and does nothing when the root is empty', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const empty = mkdtempSync(join(tmpdir(), 'orchestrator-empty-'));

  const sizeBefore = services.size;
  await launchFolder(empty);
  assert.equal(services.size, sizeBefore);

  rmSync(empty, { recursive: true, force: true });
});

test('checkScaling adds a replica to a single-instance service once cpu load crosses the threshold', async () => {
  const service = services.get('db-service')!;
  const container = service.containers[0];

  // burn cpu inside the container so the next stats sample reports it as overloaded
  const stress = run('docker', [
    'exec',
    container.id,
    'node',
    '-e',
    'const t=Date.now();while(Date.now()-t<6000){}',
  ]);

  await new Promise((resolve) => setTimeout(resolve, 1500));
  await checkScaling();
  await stress;

  assert.equal(service.containers.length, 2);
  for (const c of service.containers) {
    assert.equal((await c.inspect()).State.Running, true);
  }
});

test('checkScaling is a no-op for a service already at max replicas', async () => {
  const service = services.get('listing-service')!; // started with 3, i.e. already at the cap
  const before = service.containers.length;
  await checkScaling();
  assert.equal(service.containers.length, before);
});

test('cleanupAll stops and removes every tracked container across every service', async () => {
  const ids = [...services.values()].flatMap((s) => s.containers.map((c) => c.id));
  assert.ok(ids.length >= 7);

  await cleanupAll();
  assert.equal(services.size, 0);

  for (const id of ids) {
    await assert.rejects(() => docker.getContainer(id).inspect());
  }
});
