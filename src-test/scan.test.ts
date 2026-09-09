import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findDockerfileDirs } from '../src/scan.js';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'scan-test-'));
}

test('finds a folder with a Dockerfile', () => {
  const root = tmp();
  mkdirSync(join(root, 'api'));
  writeFileSync(join(root, 'api', 'Dockerfile'), 'FROM scratch');
  assert.deepEqual(findDockerfileDirs(root), [join(root, 'api')]);
  rmSync(root, { recursive: true, force: true });
});

test('finds Dockerfiles nested two levels deep', () => {
  const root = tmp();
  mkdirSync(join(root, 'a', 'b'), { recursive: true });
  writeFileSync(join(root, 'a', 'b', 'Dockerfile'), 'FROM scratch');
  assert.deepEqual(findDockerfileDirs(root), [join(root, 'a', 'b')]);
  rmSync(root, { recursive: true, force: true });
});

test('stops recursing once a Dockerfile is found (does not look inside it)', () => {
  const root = tmp();
  mkdirSync(join(root, 'api', 'nested'), { recursive: true });
  writeFileSync(join(root, 'api', 'Dockerfile'), 'FROM scratch');
  writeFileSync(join(root, 'api', 'nested', 'Dockerfile'), 'FROM scratch');
  assert.deepEqual(findDockerfileDirs(root), [join(root, 'api')]);
  rmSync(root, { recursive: true, force: true });
});

test('skips node_modules, .git and dist', () => {
  const root = tmp();
  for (const skipped of ['node_modules', '.git', 'dist']) {
    mkdirSync(join(root, skipped));
    writeFileSync(join(root, skipped, 'Dockerfile'), 'FROM scratch');
  }
  assert.deepEqual(findDockerfileDirs(root), []);
  rmSync(root, { recursive: true, force: true });
});

test('returns an empty list when nothing matches', () => {
  const root = tmp();
  mkdirSync(join(root, 'no-dockerfile-here'));
  assert.deepEqual(findDockerfileDirs(root), []);
  rmSync(root, { recursive: true, force: true });
});

test('ignores plain files at the root', () => {
  const root = tmp();
  writeFileSync(join(root, 'README.md'), 'hi');
  assert.deepEqual(findDockerfileDirs(root), []);
  rmSync(root, { recursive: true, force: true });
});
