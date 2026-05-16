# External plugin applications

Each subdirectory is one deployable plugin process (`plugins/<name>`), depending on **`@kosolapus/plugin-ts-sdk` from npm** (pinned `0.0.6`; root `overrides` keeps the workspace on that version).

Shared **esbuild** bundle and **prune `dist`** live in **`plugin-build-tools/`** (`@flowforge/plugin-build-tools`). Plugin-specific behaviour is declared in each package via `flowforgePluginBuild` (see below).

## Monorepo / workspace

From this directory:

```bash
npm install
npm run build --workspaces --if-present
# or one package:
npm run build -w @flowforge/plugin-office
```

Install and builds assume **npm workspaces**: dependencies are hoisted to `plugins/node_modules`, so bundle scripts point at `../node_modules/@flowforge/plugin-build-tools/scripts/…` relative to each `plugins/<name>/` folder.

If you copy a **single** plugin into its own repository, run `npm install` in that package root and change those script paths to `./node_modules/@flowforge/plugin-build-tools/scripts/…` (or publish `@flowforge/plugin-build-tools` and rely on a normal semver `devDependency`).

## Развёртывание одним `docker compose`

Файл `docker-compose.yml` поднимает **все** плагины сразу. Сборка идёт **внутри образа** (multi-stage `Dockerfile.plugin`): на сервере не нужно заранее делать `npm run build` в каждой папке.

`@kosolapus/plugin-ts-sdk` берётся с **npm** (в lockfile зафиксирован `0.0.6`), локальный каталог `sdk/` в монорепе для сборки плагинов **не нужен**.

При стеке в **одной Docker-сети** с plugin-manager: по умолчанию `PLUGIN_MANAGER_RPC_HOST=plugin-manager`, порт **`3000`** (не опубликованный с хоста `4016`); control plane: `runtime-control-plane`:**`3001`**. В манифесте `pull` используется **имя сервиса** каждого плагина (`PLUGIN_PULL_ADVERTISED_HOST`, переопределяется per-service env при необходимости).

```bash
cd plugins
docker compose --env-file ../backend/.env up -d --build
```

На удалённой машине без общей сети задайте в `.env` реальные хосты/порты для PM и CP (как при доступе с хоста — например `4016`/`4021` или `host.docker.internal`).

Отдельный образ одного плагина:

```bash
cd plugins
docker build -f Dockerfile.plugin --build-arg PLUGIN_DIR=telegram -t plugin-telegram:latest .
```

### Обновление `package-lock.json` без линка на локальный `sdk`

Если при `npm install` в `plugins/` npm снова подставляет локальный `../sdk`, временно переименуйте каталог `sdk/` (`mv sdk sdk.bak`), выполните `npm install` в `plugins/`, затем верните имя. В lockfile не должно оставаться вхождений `../sdk`.

### `flowforgePluginBuild` (in each plugin `package.json`)


| Field | Meaning |
| --- | --- |
| `helpMarkdown` | `"empty"` — create empty `dist/help.md` before bundling (helps with `prune:dist`). `"firstInDist"` — copy the first `help.md` found under `dist/`. `{ "distRelativePath": "…/help.md" }` — copy from that path under `dist/`. |
| `bundleMarkdownAsText` | When `true`, esbuild uses `loader: { '.md': 'text' }` so executors can import Markdown as strings. |

### Publishing npm packages

1. Add a real `repository` URL on the workspace root or per package when the Git remote exists.
2. Publish **`@flowforge/plugin-build-tools` first** (or a patch version), then plugins that list it under `devDependencies`.
3. After `npm run build`, each plugin’s tarball includes `dist/run.cjs` and `dist/help.md` via the `files` field. Runtime consumers only need the built artifacts, not the SDK’s `copy:help` step.
4. Scoped packages use `"publishConfig": { "access": "public" }` (already set). Set `"private": true` on any package you are not ready to publish yet.

---

- **Publication + batch pull**: `PluginPublicationTcpHostModule.forRoot(Source)` слушает PM → plugin `executor_batch_pull` по TCP (`PLUGIN_TCP_PORT` / `EXECUTOR_TCP_PORT` / `PORT`). В манифесте **`pull`** должен быть достижим **из** plugin-manager (`PLUGIN_PULL_ADVERTISED_HOST` / `_PORT`).
- **Manifest on startup (optional)**: second argument `{ manifestOnInit: true, manifestBuilder: YourBuilderClass }` — one burst of `manifest_request_v2` to plugin-manager from `PluginManifestSendOnInitService` (`PLUGIN_MANAGER_RPC_HOST`, `PLUGIN_MANAGER_RPC_PORT`, `PLUGIN_MANAGER_INGRESS_TOKEN`; retries via `PLUGIN_MANAGER_MANIFEST_ON_INIT_*`).
- **email** и остальные с control plane: `executor.task` + `TcpControlPlaneOutputRouter`, step-ack через `buildExecutorStepAckNotifierFromEnv` (`PLUGIN_CONTROL_PLANE_KEY`, `CONTROL_PLANE_TCP_HOST`, `RUNTIME_CONTROL_PLANE_TCP_PORT`).
- **jira**, **redmine**, **consensus**, **llm**, **wildberries**, **ozon**, **telegram**, **office** — один паттерн: `bootstrapPluginExecutorMicroservice`, `PluginPublicationTcpHostModule`, `*PublicationBatchSource`, `ExecutorTaskTcpController`. Отдельный compose у telegram удалён — только `plugins/docker-compose.yml`, сервис `telegram`. Опциональный `GET /health`: задать `PLUGIN_HEALTH_HTTP_PORT` и порт в compose (нужен `@nestjs/platform-express`).

Default `PLUGIN_TCP_PORT` per package (override via env): **telegram 9400**, **jira 9401**, **redmine 9402**, **consensus 9403**, **llm 9404**, **wildberries 9405**, **ozon 9406**, **email 9410**, **office 9411**.

Manifest `pull.host`/`pull.port` must be reachable **from plugin-manager** (advertise host/port accordingly in Docker/network).
