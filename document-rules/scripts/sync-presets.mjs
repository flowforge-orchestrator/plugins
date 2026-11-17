#!/usr/bin/env node
/**
 * Validate preset JSON and manifest-items for this package.
 *
 * Usage (from the package root):
 *   node scripts/sync-presets.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const presetsDir = join(pluginRoot, 'presets');

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

console.info('Preset validation —', presetsDir);

const files = readdirSync(presetsDir).filter(
  (name) => name.endsWith('.json') && name !== 'manifest-items.json',
);
let ok = true;

for (const file of files) {
  const full = join(presetsDir, file);
  try {
    const doc = loadJson(full);
    if (!doc.id || !doc.pluginId || !doc.metadata?.name) {
      console.error(`[FAIL] ${file}: missing id, pluginId, or metadata.name`);
      ok = false;
    } else if (!Array.isArray(doc.diagrams) || doc.diagrams.length === 0) {
      console.error(`[FAIL] ${file}: diagrams must be a non-empty array`);
      ok = false;
    } else {
      console.info(
        `[OK] ${file} — id=${doc.id}, name=${doc.metadata.name}, diagrams=${doc.diagrams.length}`,
      );
    }
  } catch (err) {
    console.error(`[FAIL] ${file}:`, err instanceof Error ? err.message : err);
    ok = false;
  }
}

try {
  const manifest = loadJson(join(presetsDir, 'manifest-items.json'));
  const items = Array.isArray(manifest) ? manifest : manifest.items;
  if (!Array.isArray(items)) {
    console.error('[FAIL] manifest-items.json must be an array or { items: [] }');
    ok = false;
  } else {
    console.info(`[OK] manifest-items.json — ${items.length} entries`);
  }
} catch (err) {
  console.error(
    '[FAIL] manifest-items.json:',
    err instanceof Error ? err.message : err,
  );
  ok = false;
}

if (!ok) {
  process.exitCode = 1;
} else {
  console.info('Validation passed.');
}
