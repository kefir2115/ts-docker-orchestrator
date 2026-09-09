import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ContainerStats } from 'dockerode';
import { cpuPercent } from '../src/stats.js';

function stats(over: Record<string, unknown>): ContainerStats {
  return {
    cpu_stats: { cpu_usage: { total_usage: 200 }, system_cpu_usage: 1000, online_cpus: 2 },
    precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 800 },
    ...over,
  } as unknown as ContainerStats;
}

test('computes cpu percent from usage deltas', () => {
  // delta cpu 100 / delta sys 200 * 2 cpus * 100 = 100%
  assert.equal(cpuPercent(stats({})), 100);
});

test('returns 0 when there is no precpu_stats yet (first sample)', () => {
  assert.equal(cpuPercent(stats({ precpu_stats: {} })), 0);
});

test('returns 0 when the system delta is zero or negative', () => {
  assert.equal(
    cpuPercent(
      stats({
        cpu_stats: { cpu_usage: { total_usage: 200 }, system_cpu_usage: 800, online_cpus: 2 },
      }),
    ),
    0,
  );
});

test('returns 0 when the cpu delta is zero or negative', () => {
  assert.equal(
    cpuPercent(
      stats({
        cpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 1000, online_cpus: 2 },
      }),
    ),
    0,
  );
});
