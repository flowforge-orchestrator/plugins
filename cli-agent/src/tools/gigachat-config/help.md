# CLI LLM config (GigaChat)

Тот же выход `llmConfig`, что у `plugin.cli-agent.llm-config`, но endpoint и токен
собираются из персонального ключа GigaChat.

## Входы (статика)

| Name | Назначение |
| --- | --- |
| `apiKey` | **ref** — имя секрета (`GIGACHAT_AUTH_KEY`), не raw key. Значение секрета = Authorization key из кабинета |
| `scope` | `GIGACHAT_API_PERS` (по умолчанию), B2B или CORP |
| `model` | Имя модели, по умолчанию `GigaChat-2` (см. `GET /models`) |

Chat API: `https://api.giga.chat/v1` (PERS / B2B / CORP — scope только на OAuth).
OAuth: `POST https://ngw.devices.sberbank.ru:9443/api/v2/oauth`
(`Authorization: Basic <Authorization key>`, `scope=GIGACHAT_API_PERS`, `RqUID`).

Узел один раз за запуск обменивает ключ на access token (≈30 мин) и кладёт в
`llmConfig`: `provider=custom`, `baseUrl=https://api.giga.chat/v1`,
`apiKey=<access_token>`. Долгоживущий ключ в контейнер агента не уходит.
Агенты видят только обычные поля AdapterRequest — без GigaChat-веток.

TLS: oauth и вызовы API требуют сертификат НУЦ Минцифры (вшит в плагин).

## Выходы

| Name | Описание |
| --- | --- |
| `llmConfig` | Opaque JSON для порта `llmConfig` CLI-агента |
| `status` | `ok` или `error: …` |

## Связка

`llm-config.gigachat` → `llmConfig` → каждый `plugin.cli-agent.*`.

Замена локального Ollama — смена `nodeType` узла конфига; рёбра к агентам те же.
Combiner: `CLI_LLM=gigachat node scripts/apply-cli-combiner.mjs`
(в поле `apiKey` на графе — имя секрета `GIGACHAT_AUTH_KEY`).
