# plugin-author reference

## Publication types

- **Executors** — `executors[]` + batch pull TCP → `example-plugin/src/patterns/executor-echo/`, `example-batch.source.ts`, `app.module.ts`
- **Static** — `staticAssets[]`; PM fetches by manifest URL → `example-plugin/src/patterns/static-ui/`
- **Forms** — `ui.forms[]` → `assetKey` → `example-plugin/src/patterns/static-ui/manifest.fragment.ts`
- **Widgets** — `executors[].requiredTemplateKeys[]` → `example-plugin/src/patterns/widget/`
- **Presets** — preset-service (outside manifest v2) → `example-plugin/presets/`, `scripts/sync-presets.mjs`

## Workspace integration

After copying example-plugin layout to `<plugin-dir>/`:

```json
{
  "workspaces": ["plugin-build-tools", "<plugin-dir>", "…"]
}
```

Plugin `package.json`:

- `"name": "@conveyor/plugin-<id>"`
- `conveyorPluginBuild` — see example-plugin/package.json
- `dependencies["@kosolapus/plugin-ts-sdk"]` — same version as workspace `overrides`

## Package layout

```
<plugin-dir>/
  README.md
  package.json
  tsconfig.json
  env.example
  src/
    main.ts
    app.module.ts
    getUrlFromEnv.ts
    <id>-batch.source.ts
    <id>-manifest.builder.ts
    executors.index.ts
    <domain>/...
```

## Plugin README

Every plugin package has **`README.md`** in its root (`jira/README.md`, not repo root).

**Language:** Russian prose (same as existing plugins), continuous sections — not a bullet dump.

**Required sections:**

1. **Title** — `# @conveyor/plugin-<id>` and one-line summary.
2. **Назначение** — goal, use cases, what problem the plugin solves; how secrets/config work (node static/ref, no manifest `variables`).
3. **Узлы** — table: `nodeType`, display name, short description; pointer to per-executor `help.md`.
4. **Конфигурация в редакторе** — enable plugin toggle, which fields are static/ref/ports.
5. **Для разработчика** — package name, `pluginId`, directory layout, build/test commands, Docker service name and default port, external deps, links to `env.example` and compose files in repo root.

When adding or changing executors, update README **Узлы** in the same PR.

See live examples: [`jira/README.md`](../../../jira/README.md), [`caldav/README.md`](../../../caldav/README.md).

## Ports

When authoring `env.example`:

- **Executor TCP:** `PLUGIN_TCP_PORT` = `EXECUTOR_TCP_PORT` = `PORT`; unique among plugins on host
- **Pull address:** `PLUGIN_PULL_ADVERTISED_HOST` reachable from plugin-manager
- **RPC/CP/tokens:** align with running core — sample values in [example-plugin/env.example](example-plugin/env.example)
- **HTTP static:** separate `PLUGIN_HEALTH_HTTP_PORT` when manifest includes `staticAssets`

## help.md (per executor)

Sections: purpose; inputs (name, type, port/static/ref, required); output field names; errors; editor example.

Build: `copy:help` + `conveyorPluginBuild.helpMarkdown` in plugin `package.json`.

## Inputs (`ParamDef` / `FieldDecorator`)

- **Required param:** `required: true` + DTO validation
- **Graph input:** `canBePort: true`, `isPort: true`
- **Optional link:** `canBePort: true`, `isPort: false`
- **Node config:** `static: true`
- **Secret:** `type: 'ref'`, `secretKind`

## Outputs

Each meaningful return field → one `OutputDto` → one output port name.

Opaque blob only when domain is intentionally unstructured; document in help.

## Tests

- Logic in `*.logic.ts`
- `*.executor.spec.ts`: jest, no Nest bootstrap
- ≥1 spec per new executor

## Presets

1. JSON in `presets/` + `manifest-items.json`
2. `node scripts/sync-presets.mjs` — validate JSON
3. Register on running platform (preset-service / editor «Пресеты» tab)
