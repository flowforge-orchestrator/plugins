# @conveyor/plugin-document-rules

The document-processing preset takes an uploaded file and returns a new text file for download.

## Purpose

A person places the preset «Обработка документа» on an empty process, uploads a file, runs the process, and downloads the new file. The executor applies a fixed ruleset: drop a leading UTF-8 BOM, normalize newlines, trim trailing spaces and tabs, collapse blank lines, trim blank edges, and end a non-empty document with one LF. The new name keeps the source stem and uses `.txt`. There are no secrets and no manifest variables. The source filename is a node field, not a credential.

## Nodes

| nodeType | Name | Description |
| --- | --- | --- |
| `plugin.document-rules.apply` | Обработка документа | File or text in, new text file out |

Help for the executor is `src/help.md`.

## Editor configuration

Enable the plugin **Обработка документа** in the workspace. The preset wires upload, text read, the rules node, a diagram-file write, and a process output whose `fileId` is the new file. Download that id with `GET /diagram/{diagramId}/files/{fileId}/download`. The rules are not editable on the node.

## For developers

**Package:** `@conveyor/plugin-document-rules` · **pluginId:** `document-rules`

**Layout:**

```
document-rules/
  src/
    document-rules.executor.ts
    document-rules.logic.ts
    document-rules-manifest.builder.ts
    document-rules-publication-batch.source.ts
  presets/document-rules.json
```

**Build and test:**

```bash
npm run build -w @conveyor/plugin-document-rules
npm test -w @conveyor/plugin-document-rules
```

**Docker:** service `document-rules`, port **9412** ([`docker-compose.yml`](../docker-compose.yml)). Sample host ports are in `env.example`. Do not commit `.env`.

**Preset:** `presets/document-rules.json`, catalog id `document-rules`. Check it with `npm run presets:check -w @conveyor/plugin-document-rules`. The editor list is the preset-service builtin catalog. This package holds the preset body. Registration on a running preset-service is still required before the list shows the name.

**Plugin update:** disable and remove the plugin as administrator, restart the sidecar, then enable it as the workspace user. Confirm `publicationVersion` in the sidecar log.
