# rag-knowledge: binding `system.process.call` after import

Preset diagrams are importable as-is. Callable children already have `webhook` + `manual` triggers. Parent diagrams use placeholder `diagramId` values:

`__BIND__:<settings.name>`

Example: `__BIND__:Интерпретация` with `diagramName` = `Интерпретация`.

## After import

1. Import preset `rag-knowledge` (creates 14 processes).
2. Note the real diagram id of each process whose `settings.name` matches the table below.
3. Open every parent that contains `system.process.call` and set `diagramId` to that real id (keep `diagramName` as the process name for UI).
4. Publish the child processes before running parents that call them.

## Call targets

| `diagramName` / `__BIND__` | Used by |
|---|---|
| Интерпретация | Знание: документ |
| Разрешение | Знание: документ, Знание: конфликт |
| Сверка | Знание: документ, Знание: конфликт, Ответ |
| Фиксация | Знание: документ, Знание: конфликт, Ответ |
| Проекция | Знание: документ, Знание: конфликт, Ответ |
| Сбор workspace | Ответ |
| Знание: документ | Разбор PDF, Разбор DOC, Разбор Excel, Приём arXiv |
| Разбор PDF | Приём arXiv |

Layers and intake processes can also be started directly (webhook/manual) without rebinding.

## Intake shared output contract

`documentText`, `docId`, `collectionId`, `observedAt`, `source` — same ports expected by «Знание: документ».

## Validate form (`form-id="validate"`)

Workspace island uses **one** `diagram-id` per embed (same as `index` / `ask`): `host.submitLaunch` always targets that process. There is no single orchestrator for all four intakes.

| Intake tab | Bind `diagram-id` to | Payload |
|---|---|---|
| arXiv | Приём arXiv | `htmlUrl`, optional `pdfUrl`, `docId`, `collectionId` |
| PDF URL | Разбор PDF | `pdfUrl`, `docId`, `collectionId` |
| DOC URL | Разбор DOC | `docUrl`, `docId`, `collectionId` |
| File | Разбор DOC (or «Знание: документ») | client `documentText` (+ shared ids) |

Practical options: four `:ff-plugin-form` blocks with different `diagram-id`, or one block and switch `diagram-id` when changing intake. Child `__BIND__` on intakes → «Знание: документ» must be resolved after import (table above).

File upload extracts docx/xlsx in the browser and submits `documentText` (avoids missing server PDF path and Excel `path`-only contract). Legacy `.doc` shows a clear client error.

```md
:ff-plugin-form{plugin-id="rag" form-id="validate" diagram-id="<id Приём arXiv>" refresh-interval="5000"}
```

## Known blockers (validate / deploy)

- Binary PDF URL: no server PDF text extractor; URL intake may fail — prefer file/client `documentText` or extend sidecar.
- Legacy `.doc` (non-docx): `system.office.docx.extractText` is docx-only; validate file tab rejects `.doc`.
- DOC/PDF URL binary download → local path for office/PDF parsers needs a binary fetch helper (HTTP call returns text).
- «Разбор Excel» expects server `path`; validate file tab uses client xlsx→text → «Разбор DOC» / «Знание: документ».
- Deploy / `PROCESS_CALL_TIMEOUT_MS` / S0–S2 volume: owned by the deploy agent (`compose.rag.yml`), not this preset.
