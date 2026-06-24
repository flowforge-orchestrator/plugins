# example-plugin

Reference tree for **plugin-author**. Copy into target plugin directory.

## Назначение

Минимальный плагин с одним echo-executor'ом, static UI, widget pattern и preset sync. Используется как шаблон wiring (batch source, manifest builder, AppModule), не входит в workspace `package.json`.

## Узлы

| nodeType | Название |
| --- | --- |
| `plugin.example.echo` | Example: echo |

## Для разработчика

| File | Role |
| --- | --- |
| `README.md` | Plugin doc (copy structure from [reference.md](reference.md#plugin-readme)) |
| `src/example-batch.source.ts` | `*PublicationBatchSource` |
| `src/example-manifest.builder.ts` | `*ManifestBuilder` |
| `src/app.module.ts` | `PluginPublicationTcpHostModule` + router |
| `src/patterns/executor-echo/` | executor + help + spec |
| `src/patterns/static-ui/` | `staticAssets`, `ui.forms` |
| `src/patterns/widget/` | `requiredTemplateKeys` |
| `presets/` | preset JSON + `sync-presets.mjs` |

```bash
npm install && npm run build && npm test
```

Root test from repo: `npm run test:example-plugin`.
