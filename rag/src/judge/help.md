# RAG: судья

Сверяет claims с evidence кодом: копия наблюдения, вычисленный факт с родителями, гипотеза не становится фактом, конфликт значений явный.

## Зачем

Код проверяет claims против evidence: модель не ставит себе оценку.

## Поведение

Код, без модели. На вход — `observations.researchClaims`, `observations.evidence` и опционально `decision` (ход).

- `supported` — claim копирует evidence: фрагмент лежит внутри записи (с учётом свёртки пробелов); derived копирует запись с существующими родителями.
- Гипотеза не становится `supported`.
- Два разных значения одного факта в одной локации — оба `contradicted`.
- Незакрытый слот `requiredInformation` — пробел `missing_slot`, пока ход не сдаст его через `task.unresolvedQuestions`.
- Текст ответа не меняется. Ограничения пишутся в `observations.limitations`.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Вопрос** (`message`) | `textarea` | да | нет | Вопрос |
| **Черновик** (`answer`) | `textarea` | да | нет | Если пусто — берётся observations.draftAnswer |
| **Observations** (`observations`) | `textarea` | да | нет | Observations |
| **Решение хода** (`decision`) | `textarea` | да | нет | Observations хода. Поля, которые ход сдал, приходят отсюда. |
| **История** (`history`) | `textarea` | да | нет | Вердикт дописывается в последний tool-результат |
| **API ключ LLM** (`apiKey`) | `ref` | static | нет | API ключ LLM |
| **LLM model** (`llmModel`) | `string` | static | нет | LLM model |
| **LLM base URL** (`llmBaseUrl`) | `string` | static | нет | LLM base URL |
| **Temperature** (`temperature`) | `number` | static | нет | Temperature |
| **Max tokens** (`maxTokens`) | `number` | static | нет | Max tokens |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Вердикт JSON** (`verdict`) | `textarea` | Вердикт JSON |
| **consistent** (`consistent`) | `boolean` | consistent |
| **sufficient** (`sufficient`) | `boolean` | sufficient |
| **complete** (`complete`) | `boolean` | complete |
| **Observations** (`observations`) | `textarea` | Observations |
| **История** (`history`) | `textarea` | История |
