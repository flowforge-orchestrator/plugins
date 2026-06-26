---
name: plugin-author
description: >-
  Authors Conveyor plugins: publication intake, SDK check, executors, manifest,
  staticAssets, ui.forms, widgets, presets, help, tests. Use for new plugins,
  executors, manifest fields, or copying example-plugin.
---

# plugin-author

Reference: [reference.md](reference.md). Wiring: [example-plugin/](example-plugin/).

## Intake (required before code)

Ask author and record:

- Executors — `nodeType` list
- Static — `staticAssets` URLs needed?
- Forms — `ui.forms[]` in workspace? (→ [custom-ui](example-plugin/src/patterns/custom-ui/) if yes)
- Widgets — `requiredTemplateKeys[]` on nodes? (→ same)
- Presets — preset-service catalog?
- Deployment — container sidecar / external core / host process

Pattern paths: [reference.md](reference.md#publication-types).

## SDK

```bash
npm view @kosolapus/plugin-ts-sdk version
grep @kosolapus/plugin-ts-sdk example-plugin/package.json
```

- Published npm version matches `dependencies` in new package and host workspace `overrides` (if present).
- Lockfile resolves `@kosolapus/plugin-ts-sdk` from registry only.

## Implementation

1. Copy [example-plugin/](example-plugin/) → target plugin directory (or import `patterns/`).
2. Integrate package — [reference.md](reference.md#workspace-integration).
3. Set `pluginId`, `nodeTypePrefix`, labels; ports — [reference.md](reference.md#ports).
4. Add **`README.md`** in plugin root — [reference.md](reference.md#plugin-readme).
5. One `help.md` per executor.
6. Wire `*PublicationBatchSource`, `*ManifestBuilder`, `AppModule` from [example-plugin/src/](example-plugin/src/).
7. Unit tests: `*.logic.ts` + `*.executor.spec.ts` (see `echo.*`).
8. `npm run build` and `npm test` in plugin directory.

**Note:** `example-plugin/` is not in workspace `package.json`. Test: `npm install && npm run build && npm test` inside `example-plugin/`.

## Rules

**Must:**

- Fields match `@kosolapus/plugin-ts-sdk` types
- One `OutputDto` field per output port
- `executors[]` lists `nodeType` only; transport in `@Executor` + batch pull
- Secrets: `FieldDecorator` `type: 'ref'` + `secretKind`
- Publication wiring from example-plugin
- Static, forms, widgets from [custom-ui/](example-plugin/src/patterns/custom-ui/) (preferred) or legacy stubs in `static-ui/`, `widget/`
- **`README.md`** in plugin root (purpose, nodes, editor config, developer section)
- UI bundles: **`export default`** Vue component; build must verify (`build-ui.script.fragment.mjs`)

**Platform limits (plugins that upload files via API):**

- `PAYLOAD_LIMIT` on **api** — max JSON body (`/internal/diagram/.../files` with base64)
- `FILE_MAX_SIZE_MB` on **file-service** — max stored blob
- Document both in plugin README; on 413 prefer warning + alternate output (`file` base64), not hard fail

**Forbidden:**

- Manifest/DTO fields absent from SDK
- Single `output`/`result`/`data` blob when API is structured
- Presets inside `PluginManifestRequestV2`
- Secrets in manifest `variables`
- Commit `.env`, secrets, throwaway plugins

## Custom UI (forms, widgets, islands)

If intake has forms/widgets: [custom-ui/](example-plugin/src/patterns/custom-ui/) + [reference.md](reference.md#custom-ui-publication).

**Your scope:** ESM bundles, `staticAssets`, `ui.forms`, `PluginAssetHttpModule`, `requiredTemplateKeys`. **Not your scope:** `:ff-plugin-form`, prop `host` — platform; do not patch code outside the plugin.

Workflow: `ui/` → `build-ui.mjs` (vite, `external: vue`, verify `export default`) → `*-ui-manifest.ts` → `AppModule` + manifest builder → `keepDistDirs: ["ui"]` → bump `publicationVersion`, rebuild container.

Components: `host` prop only; launch — `host.submitLaunch({ portName: value })`; status — `host.latestResult`, `host.reloadRuns()`. Widget — executor card body only, not the full card.

In executor `help.md`: `:ff-plugin-form{plugin-id="…" form-id="…" diagram-id="…"}` (+ `refresh-interval` for poll). Requires public portal and `system.output` on the status form.

Verify: new `publicationVersion` in logs; `export default` in `dist/ui/*.mjs`; island loads in workspace.
