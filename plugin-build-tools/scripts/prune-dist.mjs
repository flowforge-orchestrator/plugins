#!/usr/bin/env node
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
const keep = new Set(['run.cjs', 'help.md']);

for (const name of readdirSync(dist)) {
  if (!keep.has(name)) {
    rmSync(join(dist, name), { recursive: true, force: true });
  }
}
