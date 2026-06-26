# Plugins

| Task | Skill |
| --- | --- |
| New plugin, executor, manifest, static/UI/presets | [plugin-author](.cursor/skills/plugin-author/SKILL.md) |
| Run, ports, compose, demo | [plugin-run-local](.cursor/skills/plugin-run-local/SKILL.md) |

SDK: `@kosolapus/plugin-ts-sdk` (pin in `package.json` → `overrides`; verify with `npm view` before bump).

Wiring: [example-plugin](.cursor/skills/plugin-author/example-plugin/) (not in workspaces; test via `npm run test:example-plugin`).

Demo from **repo root**: `docker compose -f compose.demo.yml --env-file compose.env.example up -d --build`.

After plugin rebuild: disable+remove in UI (admin) → restart sidecar → enable (workspace user). See [README.md](README.md#обновление-плагина-после-пересборки).

Skill `plugin-run-local` `templates/` — snippet-only; runnable compose is at repo root.
