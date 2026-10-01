# RAG: рамка вопроса

Охват (вся коллекция, названный документ, вне корпуса), слоты ответа и сущность. Пишет модель.

## Зачем

Режим и поля контракта задают, нужен ли корпус и что именно собирать.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Сообщение** (`message`) | `textarea` | да | да | Сообщение |
| **История** (`history`) | `textarea` | да | нет | История |
| **Observations** (`observations`) | `textarea` | да | нет | Observations |
| **Action** (`action`) | `string` | да | нет | Если задан и не topic — passthrough observations |
| **Enabled** (`enabled`) | `boolean` | да | нет | Enabled |
| **API ключ LLM** (`apiKey`) | `ref` | static | нет | API ключ LLM |
| **LLM model** (`llmModel`) | `string` | static | нет | LLM model |
| **LLM base URL** (`llmBaseUrl`) | `string` | static | нет | LLM base URL |
| **Temperature** (`temperature`) | `number` | static | нет | Temperature |
| **Max tokens** (`maxTokens`) | `number` | static | нет | Max tokens |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Frame JSON** (`frame`) | `textarea` | Frame JSON |
| **skipRetrieval** (`skipRetrieval`) | `string` | "true" | "false" |
| **population** (`population`) | `string` | collection | named | none |
| **mode** (`mode`) | `string` | direct | retrieval | analysis | research |
| **Observations** (`observations`) | `textarea` | Observations |
