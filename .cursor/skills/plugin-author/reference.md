# plugin-author reference

## Publication types

- **Executors** — `executors[]` + batch pull TCP → `example-plugin/src/patterns/executor-echo/`, `example-batch.source.ts`, `app.module.ts`
- **Static** — `staticAssets[]`; PM fetches by manifest URL → [custom-ui/](example-plugin/src/patterns/custom-ui/) or stub `static-ui/`
- **Forms** — `ui.forms[]` → `assetKey` → [custom-ui/](example-plugin/src/patterns/custom-ui/)
- **Widgets** — `executors[].requiredTemplateKeys[]` → [custom-ui/](example-plugin/src/patterns/custom-ui/) or stub `widget/`
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

Every plugin package has **`README.md`** in the plugin package root (not monorepo root).

**Language:** English prose, continuous sections — not a bullet dump.

**Required sections:**

1. **Title** — `# @conveyor/plugin-<id>` and one-line summary.
2. **Purpose** — goal, use cases, what problem the plugin solves; how secrets/config work (node static/ref, no manifest `variables`).
3. **Nodes** — table: `nodeType`, display name, short description; pointer to per-executor `help.md`.
4. **Editor configuration** — enable plugin toggle, which fields are static/ref/ports.
5. **For developers** — package name, `pluginId`, layout, build/test commands, Docker service name and default port, external deps, `env.example`, **plugin update workflow** (see below).

When adding or changing executors, update README **Nodes** in the same PR.

## Plugin update (after rebuild)

Document in every plugin README **For developers** (and follow on each release):

1. **Disable and remove** the plugin in the UI — **Plugins** tab, **administrator** account.
2. **Restart** the plugin sidecar/container.
3. **Enable** the plugin — **Plugins** tab, under the **target workspace user**.

Then verify new `publicationVersion` in sidecar logs and `plugin_publication_committed` in plugin-manager.

## Ports

When authoring `env.example`:

- **Executor TCP:** `PLUGIN_TCP_PORT` = `EXECUTOR_TCP_PORT` = `PORT`; unique among plugins on host
- **Pull address:** `PLUGIN_PULL_ADVERTISED_HOST` reachable from plugin-manager
- **RPC/CP/tokens:** align with running core — sample values in [example-plugin/env.example](example-plugin/env.example)
- **HTTP static:** separate `PLUGIN_HEALTH_HTTP_PORT` when manifest includes `staticAssets` (forms/widgets). URLs in manifest = `http://${PLUGIN_PULL_ADVERTISED_HOST}:${PLUGIN_HEALTH_HTTP_PORT}/assets/:key`. Docker copies `dist/ui/` → container `./ui/` for `PluginAssetHttpModule`.

## help.md (per executor)

Sections: purpose; inputs (name, type, port/static/ref, required); output field names; errors; editor example.

Build: `copy:help` + `conveyorPluginBuild.helpMarkdown` in plugin `package.json`.

## Inputs (`ParamDef` / `FieldDecorator`)

- **Required param:** `required: true` + DTO validation
- **Graph input:** `canBePort: true`, `isPort: true`
- **Optional link:** `canBePort: true`, `isPort: false`
- **Node config:** `static: true`
- **Secret:** `type: 'ref'`, `secretKind`

## Widgets

- `executors[].requiredTemplateKeys[]` → static asset key `ui.widget.*`
- Bundle must **`export default`** the Vue component (host passes `host` prop with `config`, `outputs`, `label`)
- Canvas: custom widget replaces **body** of executor card on diagram, not header/ports

## Custom UI publication

Copy [example-plugin/src/patterns/custom-ui/](example-plugin/src/patterns/custom-ui/).

- **Keys:** form `ui.form.<formId>` = `ui.forms[].assetKey`; widget `ui.widget.<id>` = `executors[].requiredTemplateKeys`.
- **Build:** `scripts/build-ui.mjs` → `dist/ui/*.mjs`; `vue` external; every file must `export default`.
- **Runtime:** `PluginAssetHttpModule.forRoot({ assetsDir: join(__dirname,'ui'), assets })` in `AppModule`; manifest — `staticAssets`, `ui`, widget keys. URL: `pluginAssetHttpBaseUrl()` + `/assets/:key` (`PLUGIN_HEALTH_HTTP_PORT`, default 9414).
- **package.json:** `build:ui` before bundle; `conveyorPluginBuild.keepDistDirs: ["ui"]`.
- **Forms:** prop `host` — types in `form-host-api.fragment.ts`. Launch: `submitLaunch({ portName })`. Poll: `latestResult`, `reloadRuns`. Do not call platform APIs from the bundle.
- **Island:** `:ff-plugin-form{plugin-id form-id diagram-id|public-portal-slug}`; poll — `refresh-interval`. Examples: `workspace-markdown.examples.md`. Inline `:ff-…`, not `::` block.
- **Release:** bump `publicationVersion`, rebuild sidecar, then **plugin update workflow** (disable+remove as admin → restart sidecar → enable as workspace user). Stale UI in browser = old publication, container, or workspace binding.

Common failures: form not found (plugin disabled / wrong form-id); no host (component not mounted via island host); broken reactivity (`vue` not external); default widget (missing `requiredTemplateKeys` or 404 on asset).

Fragment sources: `ui-manifest.fragment.ts`, `build-ui.script.fragment.mjs`, `form-launch.component.fragment.ts` in the same folder.

## File uploads from plugins

If executor uploads binaries via platform API (e.g. `POST /internal/diagram/{id}/files` with base64):

| Env | Service | Role |
|-----|---------|------|
| `PAYLOAD_LIMIT` | api | JSON request body limit |
| `FILE_MAX_SIZE_MB` | file-service | Stored blob limit |

Document in plugin README. Handle 413 gracefully: keep structured output (e.g. base64 port), add `warnings`, empty optional URL fields.

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
3. Register on running platform (preset-service / editor Presets tab)
