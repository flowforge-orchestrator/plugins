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
- Forms — `ui.forms[]` in workspace?
- Widgets — `requiredTemplateKeys[]` on nodes?
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

**Note:** `example-plugin/` is not in workspace `package.json`. Test it with `npm install && npm run build && npm test` inside `example-plugin/`, or `npm run test:example-plugin` from repo root.

## Rules

**Must:**

- Fields match `@kosolapus/plugin-ts-sdk` types
- One `OutputDto` field per output port
- `executors[]` lists `nodeType` only; transport in `@Executor` + batch pull
- Secrets: `FieldDecorator` `type: 'ref'` + `secretKind`
- Publication wiring from example-plugin
- Static, forms, widgets from example-plugin patterns (`static-ui/`, `widget/`)
- **`README.md`** in plugin root (purpose, nodes, editor config, developer section)

**Forbidden:**

- Manifest/DTO fields absent from SDK
- Single `output`/`result`/`data` blob when API is structured
- Presets inside `PluginManifestRequestV2`
- Secrets in manifest `variables`
- Commit `.env`, secrets, throwaway plugins
