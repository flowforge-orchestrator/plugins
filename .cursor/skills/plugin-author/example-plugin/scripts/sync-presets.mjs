#!/usr/bin/env node
/**
 * Validate preset JSON and manifest-items for a plugin package.
 *
 * Usage (from plugin package after copying presets/):
 *   node scripts/sync-presets.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginRoot = join(__dirname, '..');
const presetsDir = join(pluginRoot, 'presets');

function loadJson(path) {
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw);
}

console.info('Preset validation —', presetsDir);

const files = readdirSync(presetsDir).filter((f) => f.endsWith('.json') && f !== 'manifest-items.json');
let ok = true;

for (const file of files) {
  const full = join(presetsDir, file);
  try {
    const doc = loadJson(full);
    if (!doc.id || !doc.pluginId) {
      console.error(`[FAIL] ${file}: missing id or pluginId`);
      ok = false;
    } else {
      console.info(`[OK] ${file} — id=${doc.id}, pluginId=${doc.pluginId}`);
    }
  } catch (err) {
    console.error(`[FAIL] ${file}:`, err instanceof Error ? err.message : err);
    ok = false;
  }
}

const manifestItemsPath = join(presetsDir, 'manifest-items.json');
try {
  const items = loadJson(manifestItemsPath);
  if (!Array.isArray(items)) {
    console.error('[FAIL] manifest-items.json must be an array');
    ok = false;
  } else {
    console.info(`[OK] manifest-items.json — ${items.length} entries`);
  }
} catch (err) {
  console.warn('[WARN] manifest-items.json:', err instanceof Error ? err.message : err);
}

if (!ok) {
  process.exitCode = 1;
} else {
  console.info('Validation passed. Register presets on the running platform (preset-service / editor «Пресеты»).');
}
