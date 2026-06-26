# example-plugin

Reference tree for **plugin-author**. Copy into target plugin directory.

## Purpose

Minimal plugin with one echo executor, static UI, widget pattern, and preset sync. Template for wiring (batch source, manifest builder, AppModule); not listed in workspace `package.json`.

## Nodes

- `plugin.example.echo` — Example: echo

## For developers

- `src/example-batch.source.ts` — batch pull
- `src/example-manifest.builder.ts` — manifest
- `src/app.module.ts` — Nest wiring
- `src/patterns/executor-echo/` — executor + help + spec
- `src/patterns/custom-ui/` — forms, widgets, islands (full cycle)
- `src/patterns/static-ui/`, `widget/` — stub manifests
- `presets/` — preset JSON + sync script

```bash
npm install && npm run build && npm test
```

Root test from repo: `npm run test:example-plugin`.

**After sidecar rebuild:** (1) disable and remove plugin in UI as admin → (2) restart plugin container → (3) enable under the workspace user. See [plugins/README.md](../../../README.md#обновление-плагина-после-пересборки).
