import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Container } from 'dockerode';
import { docker } from './docker.js';
import { findDockerfileDirs } from './scan.js';
import { ensureNetwork, NETWORK_NAME } from './network.js';
import { cpuPercent } from './stats.js';

// ponytail: tune from real load, not guesswork
const SCALE_UP_CPU_PERCENT = 70;
const MAX_REPLICAS = 3;
const SCALE_CHECK_INTERVAL_MS = 10_000;

export type Service = { tag: string; exposedPorts: string[]; containers: Container[] };
export const services = new Map<string, Service>();

async function createReplica(
  name: string,
  tag: string,
  exposedPorts: string[],
): Promise<Container> {
  const networkId = await ensureNetwork();
  const replicaN = (services.get(name)?.containers.length ?? 0) + 1;

  const container = await docker.createContainer({
    Image: tag,
    name: `${name}-${replicaN}`,
    ExposedPorts: Object.fromEntries(exposedPorts.map((p) => [p, {}])),
    HostConfig: {
      PortBindings: Object.fromEntries(exposedPorts.map((p) => [p, [{ HostPort: '' }]])),
    },
    NetworkingConfig: {
      EndpointsConfig: { [NETWORK_NAME]: { NetworkID: networkId, Aliases: [name] } },
    },
  });
  await container.start();
  return container;
}

// ponytail: an optional "replicas.txt" (just a number) lets a fixture demo declaring several
// identical instances up front, instead of only ever growing them via the CPU autoscaler
function declaredReplicas(dir: string): number {
  try {
    const n = Number.parseInt(readFileSync(join(dir, 'replicas.txt'), 'utf8').trim(), 10);
    return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_REPLICAS) : 1;
  } catch {
    return 1;
  }
}

async function buildAndRun(dir: string): Promise<void> {
  const name = basename(dir);
  const tag = `orchestrator/${name}:latest`;
  const src = readdirSync(dir, { recursive: true }) as string[];

  const buildStream = await docker.buildImage({ context: dir, src }, { t: tag });
  await new Promise<void>((resolve, reject) =>
    docker.modem.followProgress(buildStream, (err) => (err ? reject(err) : resolve())),
  );

  const image = await docker.getImage(tag).inspect();
  const exposedPorts = Object.keys(image.Config.ExposedPorts ?? {});

  services.set(name, { tag, exposedPorts, containers: [] });
  // sequential: createReplica numbers containers off the current count, parallel calls would race on it
  for (let i = 0; i < declaredReplicas(dir); i++) {
    const container = await createReplica(name, tag, exposedPorts);
    services.get(name)!.containers.push(container);
  }
}

export async function printTable(): Promise<void> {
  const rows: Record<string, string>[] = [];
  for (const [name, service] of services) {
    for (const container of service.containers) {
      const info = await container.inspect();
      const hostPorts = [
        ...new Set(
          Object.values(info.NetworkSettings.Ports ?? {})
            .flat()
            .filter(Boolean)
            .map((b) => b!.HostPort),
        ),
      ].join(', ');
      rows.push({
        service: name,
        container: info.Name.replace(/^\//, ''),
        'host port(s)': hostPorts || '-',
        'in-network address': `${name}:${service.exposedPorts[0]?.split('/')[0] ?? '-'}`,
      });
    }
  }
  console.table(rows);
}

// ponytail: for code running on the host (not itself a container on orchestrator-net) —
// containers reach each other by name, but the host has to go through the published port instead
export async function getHostPort(name: string): Promise<string | undefined> {
  const container = services.get(name)?.containers[0];
  if (!container) return undefined;
  const info = await container.inspect();
  return Object.values(info.NetworkSettings.Ports ?? {}).flat().filter(Boolean)[0]?.HostPort;
}

export async function checkScaling(): Promise<void> {
  for (const [name, service] of services) {
    if (service.containers.length >= MAX_REPLICAS) continue;
    const loads = await Promise.all(
      service.containers.map((c) => c.stats({ stream: false }).then(cpuPercent)),
    );
    if (Math.max(...loads) < SCALE_UP_CPU_PERCENT) continue;

    console.log(`[${name}] overloaded (${Math.max(...loads).toFixed(0)}% cpu), starting a replica`);
    const replica = await createReplica(name, service.tag, service.exposedPorts);
    service.containers.push(replica);
    await printTable();
  }
}

let autoscaleInterval: NodeJS.Timeout | undefined;

// ponytail: exported so tests can stop the periodic background scaler before driving
// checkScaling() manually — otherwise the two race and double-scale a service
export function stopAutoscaler(): void {
  clearInterval(autoscaleInterval);
}

export async function launchFolder(root: string): Promise<void> {
  const dirs = findDockerfileDirs(root);
  if (dirs.length === 0) {
    console.log(`no Dockerfile found under ${root}`);
    return;
  }
  await ensureNetwork();
  await Promise.all(dirs.map(buildAndRun));
  await printTable();
  console.log(
    `services reach each other by container name over "${NETWORK_NAME}", e.g. http://auth-service/status`,
  );

  autoscaleInterval = setInterval(() => void checkScaling(), SCALE_CHECK_INTERVAL_MS);
  autoscaleInterval.unref();
}

// ponytail: stop+remove is best-effort on exit; add retry/backoff if the daemon flakes mid-shutdown
// split from the signal handler so tests can exercise cleanup without killing the test process
export async function cleanupAll(): Promise<void> {
  const all = [...services.values()].flatMap((s) => s.containers);
  await Promise.all(all.map((c) => c.stop().catch(() => {})));
  await Promise.all(all.map((c) => c.remove().catch(() => {})));
  services.clear();
}

process.on('SIGINT', () => void cleanupAll().then(() => process.exit(0)));
process.on('SIGTERM', () => void cleanupAll().then(() => process.exit(0)));
