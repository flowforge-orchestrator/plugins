#!/usr/bin/env node
/**
 * Skeleton build-ui.mjs — copy to <plugin>/scripts/build-ui.mjs and adjust entries.
 *
 * Requirements:
 * - one Vite lib build per staticAssets key → dist/ui/<key>.mjs
 * - vue external (host provides singleton via usePluginUiModule shim)
 * - every output must contain `export default`
 */
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';

const uiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'ui');
const outDir = resolve(uiRoot, '../dist/ui');

const entries = {
  'ui.form.launch': resolve(uiRoot, 'src/entries/form-launch.ts'),
  'ui.form.status': resolve(uiRoot, 'src/entries/form-status.ts'),
  'ui.widget.myplugin': resolve(uiRoot, 'src/entries/widget-myplugin.ts'),
};

function assertDefaultExport(code, label) {
  if (!/\bexport\s*\{[^}]*\bdefault\b|\bexport\s+default\b/.test(code)) {
    throw new Error(`${label}: bundle must export default component`);
  }
}

for (const [name, input] of Object.entries(entries)) {
  await build({
    configFile: false,
    plugins: [vue()],
    build: {
      outDir,
      emptyOutDir: name === Object.keys(entries)[0],
      minify: true,
      lib: { entry: input, formats: ['es'], fileName: () => `${name}.mjs` },
      rollupOptions: {
        external: (id) => id === 'vue' || id.startsWith('vue/'),
      },
    },
  });
  const outFile = resolve(outDir, `${name}.mjs`);
  const code = readFileSync(outFile, 'utf8');
  assertDefaultExport(code, name);
  console.log(`Built ${name}.mjs`);
}
