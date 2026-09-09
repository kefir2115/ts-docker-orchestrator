import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { docker } from '../src/docker.js';

const run = promisify(execFile);

// exercises the real SIGTERM handler wired up in src/orchestrator.ts: it can only be observed
// from outside the process (it calls process.exit), so this spawns the CLI as a child instead
// of importing the module in-process.
test('SIGTERM stops and removes containers the orchestrator started', async () => {
  const root = mkdtempSync(join(tmpdir(), 'shutdown-test-'));
  mkdirSync(join(root, 'shutdown-check'));
  writeFileSync(
    join(root, 'shutdown-check', 'Dockerfile'),
    'FROM busybox\nEXPOSE 8080\nCMD ["httpd", "-f", "-p", "8080", "-h", "/"]\n',
  );

  const child = spawn('node', ['--import', 'tsx', 'src/index.ts', root], { stdio: 'pipe' });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out, output so far:\n${output}`)),
        30_000,
      );
      const check = setInterval(() => {
        if (output.includes('shutdown-check-1')) {
          clearInterval(check);
          clearTimeout(timer);
          resolve();
        }
      }, 200);
    });

    const info = await docker.getContainer('shutdown-check-1').inspect();
    assert.equal(info.State.Running, true);

    child.kill('SIGTERM');
    await new Promise((resolve) => child.on('exit', resolve));

    await assert.rejects(() => docker.getContainer('shutdown-check-1').inspect());
  } finally {
    await run('docker', ['rm', '-f', 'shutdown-check-1']).catch(() => {});
    rmSync(root, { recursive: true, force: true });
  }
});
