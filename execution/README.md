# @conveyor/plugin-execution

Runs caller-supplied code and one-shot containers as process steps.

## Purpose

The plugin covers three steps that the system catalog does not: a code snippet, a small transform between nodes, and a container that starts, runs, and is removed. JavaScript stays inside the plugin process. It receives `input`, may return a value, and cannot touch files, the network, or `process`. Python and shell run only as a fresh container with no network, no extra capabilities, a memory cap, and `--rm`. The container step uses the same limits. The image is a registry reference, and the command is a JSON array, so the host shell is not involved. Secrets are not declared. Pass non-secret values through static fields or ports.

## Nodes

| nodeType | Name | Role |
| --- | --- | --- |
| `plugin.execution.code` | Код | JavaScript sandbox, or python/shell in a locked container. See `src/execution/code/help.md`. |
| `plugin.execution.edge` | Edge-функция | JavaScript transform from the upstream value to **value**. See `src/execution/edge/help.md`. |
| `plugin.execution.container` | Контейнер | One-shot container through completion, then remove. See `src/execution/container/help.md`. |

## Editor configuration

Enable the plugin for the workspace. **language**, **source**, **timeoutMs**, **image**, **command**, and **env** are static fields. **source** on the code node and **input** on the code and edge nodes can also be ports. There is no secret field.

## For developers

Package `@conveyor/plugin-execution`, `pluginId` `execution`. Sources live under `src/execution`. Build and test from `plugins/execution`: `npm test`, then `npm run build`. The `docker-compose.yml` service is `execution`, TCP port **9415**. Python, shell, and the container node talk to the Docker Engine API on `/var/run/docker.sock`. Sample environment is `env.example`.

After a rebuild: disable and remove the plugin in the UI as an administrator, restart the sidecar, then enable it again as the workspace user. Confirm `publicationVersion` in the sidecar log and `plugin_publication_committed` for `execution` in plugin-manager.
