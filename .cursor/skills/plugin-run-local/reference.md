# plugin-run-local reference

## Port rules

- **Executor TCP:** one listen port — `PLUGIN_TCP_PORT` = `EXECUTOR_TCP_PORT` = `PORT`; unique per process on host/compose
- **Compose mapping:** `ports:` matches the three env vars above
- **Pull address:** `PLUGIN_PULL_ADVERTISED_HOST` (+ `_PORT` if set) reachable from plugin-manager; sidecar → service DNS name; host plugin + Docker PM → `host.docker.internal` (Mac/Windows) or host IP (Linux)
- **Core RPC/CP:** `PLUGIN_MANAGER_RPC_*`, `CONTROL_PLANE_TCP_HOST`, `RUNTIME_CONTROL_PLANE_TCP_PORT`, tokens from repo `compose.env.example` + compose anchors
- **HTTP static:** `PLUGIN_HEALTH_HTTP_PORT` separate from executor TCP when `staticAssets` present
- **Core collision:** executor port ≠ demo core ports (`DEMO_*` in `compose.env.example`)
- **New plugin:** pick free port; record in plugin `env.example` + compose; scan `compose.demo.yml`, `docker-compose.yml`, sibling `env.example`

## Forbidden

- `PLUGIN_PULL_ADVERTISED_HOST=127.0.0.1` when PM runs in Docker and plugin on host
- Mismatch among `PLUGIN_TCP_PORT`, `EXECUTOR_TCP_PORT`, `PORT`
- Same port for executor TCP and `PLUGIN_HEALTH_HTTP_PORT`

## Config sources (this repo)

- Demo host ports — `compose.env.example` (`DEMO_*`)
- Demo sidecar wiring — `compose.demo.yml`
- External core / all plugins — `docker-compose.yml`, prod-like section in `compose.env.example`
- Package ports — `<package>/env.example` (where present)
- Copy-paste snippets — `templates/` (not a second runnable stack)

## env template (host plugin + demo)

See repo `compose.env.example` + [templates/env.host.example](templates/env.host.example).

## Sidecar fragment

See `myplugin` in [templates/compose.demo.yml](templates/compose.demo.yml); prefer copying an existing service from repo `compose.demo.yml`.

## After plugin update (platform UI)

Run after rebuild, `publicationVersion` bump, or manifest/UI bundle changes:

1. **Disable and remove** the plugin — editor **Plugins** tab, **admin** account.
2. **Restart** the plugin process/container.
3. **Enable** the plugin — **Plugins** tab, under the **workspace user** who runs the editor.

Skipping step 1 often leaves stale catalog/UI until the old workspace binding is cleared.
