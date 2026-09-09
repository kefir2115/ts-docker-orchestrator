import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);

// ponytail: stops recursing once a Dockerfile is found (that folder is the image), so nested build artifacts aren't rescanned
export function findDockerfileDirs(root: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
    const dir = join(root, entry.name);
    if (readdirSync(dir).includes('Dockerfile')) {
      found.push(dir);
    } else {
      found.push(...findDockerfileDirs(dir));
    }
  }
  return found;
}
