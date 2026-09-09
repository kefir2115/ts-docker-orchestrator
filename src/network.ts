import { docker } from './docker.js';

export const NETWORK_NAME = 'orchestrator-net';

// ponytail: a user-defined bridge network gives free container-name DNS + round-robin
// across replicas sharing an alias, no hand-rolled proxy/load balancer needed
export async function ensureNetwork(): Promise<string> {
  const nets = await docker.listNetworks({ filters: JSON.stringify({ name: [NETWORK_NAME] }) });
  const existing = nets.find((n) => n.Name === NETWORK_NAME);
  if (existing) return existing.Id;
  const net = await docker.createNetwork({ Name: NETWORK_NAME, Driver: 'bridge' });
  return net.id;
}
