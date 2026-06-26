#!/usr/bin/env node
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');
const keep = new Set(['run.cjs', 'help.md']);

let extraKeep = [];
try {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const dirs = pkg.conveyorPluginBuild?.keepDistDirs;
  if (Array.isArray(dirs)) {
    extraKeep = dirs.filter((d) => typeof d === 'string' && d.trim());
  }
} catch {
  // ignore malformed package.json during prune
}
for (const dir of extraKeep) keep.add(dir);

for (const name of readdirSync(dist)) {
  if (!keep.has(name)) {
    rmSync(join(dist, name), { recursive: true, force: true });
  }
}
