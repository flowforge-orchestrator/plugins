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

```bash
cd plugins
docker compose --env-file ../backend/.env up -d --build
```

На удалённой машине выставьте в `.env` реальные хосты вместо `host.docker.internal` (на Linux его по умолчанию нет): как минимум `PLUGIN_MANAGER_RPC_HOST`, `CONTROL_PLANE_TCP_HOST`, при необходимости `PLUGIN_PULL_ADVERTISED_HOST`, чтобы plugin-manager и control plane достигали контейнеров по сети. Частый вариант — одна пользовательская Docker-сеть с основным стеком и `external: true` (см. комментарий в конце `docker-compose.yml`).

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

- **Publication + batch pull**: `PluginPublicationTcpHostModule.forRoot(Source)` listens for PM → plugin `executor_batch_pull` on the Nest TCP ingress (telegram: `EXECUTOR_TCP_PORT` / `PORT`; see each plugin). In `manifestBuilder`, **`pull`** must advertise an address reachable **from plugin-manager** (optional env `PLUGIN_PULL_ADVERTISED_HOST` / `_PORT`).
- **Manifest on startup (optional)**: second argument `{ manifestOnInit: true, manifestBuilder: YourBuilderClass }` — one burst of `manifest_request_v2` to plugin-manager from `PluginManifestSendOnInitService` (`PLUGIN_MANAGER_RPC_HOST`, `PLUGIN_MANAGER_RPC_PORT`, `PLUGIN_MANAGER_INGRESS_TOKEN`; retries via `PLUGIN_MANAGER_MANIFEST_ON_INIT_*`).
- **email** — как **telegram**: `executor.task` + `TcpControlPlaneOutputRouter`, step-ack через `buildExecutorStepAckNotifierFromEnv` (переменные TCP к CP как в платформе: `PLUGIN_CONTROL_PLANE_KEY`, `CONTROL_PLANE_TCP_HOST`, `RUNTIME_CONTROL_PLANE_TCP_PORT`).
- **telegram** — TCP host for publication batch pull; **`npm run start:dev`** rebuild + restart pattern. Requires **`@nestjs/platform-express`** with `NestFactory.create` when HTTP health is enabled.
- **jira**, **redmine**, **consensus**, **llm**, **wildberries**, **ozon**, **telegram**, **office** — publication-batch pattern (`main.ts`, `PluginPublicationTcpHostModule`, `*PublicationBatchSource`, executors registry).

Default `PLUGIN_TCP_PORT` per package (override via env): **telegram 9400**, **jira 9401**, **redmine 9402**, **consensus 9403**, **llm 9404**, **wildberries 9405**, **ozon 9406**, **email 9410**, **office 9411**.

Manifest `pull.host`/`pull.port` must be reachable **from plugin-manager** (advertise host/port accordingly in Docker/network).
