#!/usr/bin/env node
import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const uiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'ui');
const outDir = resolve(uiRoot, '../dist/ui');

const entries = {
  'ui.form.index': resolve(uiRoot, 'src/entries/form-index.ts'),
  'ui.form.search': resolve(uiRoot, 'src/entries/form-search.ts'),
  'ui.form.ask': resolve(uiRoot, 'src/entries/form-ask.ts'),
  'ui.form.stats-pipeline': resolve(uiRoot, 'src/entries/form-stats-pipeline.ts'),
  'ui.form.stats-chat': resolve(uiRoot, 'src/entries/form-stats-chat.ts'),
  'ui.widget.rag.plan': resolve(uiRoot, 'src/entries/widget-plan.ts'),
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
