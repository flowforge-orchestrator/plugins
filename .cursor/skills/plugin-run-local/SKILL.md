---
name: plugin-run-local
description: >-
  Runs Conveyor plugins: demo compose, external stack, host debug, port/env rules.
  Use when starting a plugin, fixing ports, or editing compose in the plugins repo.
---

# plugin-run-local

Port/env rules: [reference.md](reference.md).

## This repository (default)

Run from **repository root** (where `Dockerfile.plugin`, `compose.demo.yml`, plugin packages live):

```bash
docker compose -f compose.demo.yml --env-file compose.env.example up -d --build

docker compose --env-file compose.env.example up -d --build

cp templates/env.host.example <plugin-dir>/.env
cd <plugin-dir> && npm run build && npm start
```

Host plugin against demo: set `PLUGIN_PULL_ADVERTISED_HOST=host.docker.internal` (Mac/Windows Docker) or host LAN IP (Linux); see [reference.md](reference.md#port-rules).

## templates/ (snippet only)

Files under [templates/](templates/) are **copy-paste fragments** for new sidecar services. They are **not** runnable from the skill directory without `PLUGIN_BUILD_CONTEXT=<repo-root>`.

## Add sidecar to compose.demo.yml

Copy `jira` (or any plugin) service in repo `compose.demo.yml`; set:

- `PLUGIN_DIR`, unique executor port env vars
- `environment`: `<<: *plugin-to-demo`, `PLUGIN_PULL_ADVERTISED_HOST` = compose service name
- `PLUGIN_TCP_PORT` = `EXECUTOR_TCP_PORT` = `PORT` = `ports:` mapping

Snippet reference: [templates/compose.demo.yml](templates/compose.demo.yml) (`myplugin` block).

## Verify

- `plugin_wire_outbound_manifest_ok` — plugin logs
- `plugin_publication_committed` — plugin-manager logs
- `plugin_static_cached` — plugin-manager (only if manifest includes non-empty `staticAssets`)
- Nodes in palette — editor «Палитра»
- Plugin enabled — editor «Плагины» tab

Health: `DEMO_PM_HEALTH_PORT`, `DEMO_WEB_PORT` in repo `compose.env.example`.

## After plugin update (rebuild)

After code changes, a new `publicationVersion`, or `docker compose build`, the platform may keep an old publication or workspace binding. **Order matters:**

1. **Disable and remove** the plugin in the UI — **Plugins** tab, signed in as a **workspace/global administrator**.
2. **Restart** the plugin sidecar — e.g. `docker compose restart <service>` or `docker compose up -d --build <service>`.
3. **Enable** the plugin again — **Plugins** tab, under the **target user account** that edits processes.

Verify: sidecar logs show the new `publicationVersion`; plugin-manager logs show `plugin_publication_committed`; nodes appear in the palette with **online** status.

## Diagnostics

- **`unauthorized`:** match `PLUGIN_MANAGER_INGRESS_TOKEN`, `PLUGIN_CONTROL_PLANE_KEY` to core
- **batch pull fails:** `PLUGIN_PULL_ADVERTISED_HOST` reachable from plugin-manager network
- **port bind error:** unique `PLUGIN_TCP_PORT` vs other services + `DEMO_*` core ports
- **no nodes:** manifest logs + enable plugin in UI

## staticAssets

Set `PLUGIN_HEALTH_HTTP_PORT` for HTTP `/assets/*`; executor TCP uses `PLUGIN_TCP_PORT`. Manifest URLs point at HTTP port.
