import type { ContainerStats } from 'dockerode';

// ponytail: the same delta formula `docker stats` itself uses;
// a container's very first sample has no precpu_stats yet, so treat that as 0% rather than crash
export function cpuPercent(stats: ContainerStats): number {
  if (!stats.precpu_stats?.cpu_usage) return 0;
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  if (systemDelta <= 0 || cpuDelta <= 0) return 0;
  return (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100;
}
