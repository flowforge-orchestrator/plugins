# RAG: ход агента

Называет одну следующую операцию. Узлы схемы выполняют её сами. direct и retrieval не зовут модель. retrieval запрашивает следующее поле или сдаёт его.

## Зачем

Один ход выбирает одну операцию; цикл и узлы схемы исполняют её сами.

## Поведение

- `direct` и `retrieval` не вызывают модель. `retrieval` запрашивает следующее незакрытое поле контракта через `queryTool`.
- Поле, которое уже спрашивали и на котором нет принятого claim, ход записывает в `unresolvedQuestions` и ставит `op=none`. Сдаёт поле только ход — не поиск, не propose и не critic.
- `analysis` и `research` вызывают модель, только если очередь операций пуста. Остальные операции ждут в `queue`.
- Режим приходит портом `mode` или из `observations.task`. Список допустимых `op` — карточки на входе `tools`.
- Порт `enabled` держит узел, пока ветка `system.control.switch` не запишет значение.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Пользовательский промпт** (`userPrompt`) | `textarea` | да | да | Текст вопроса |
| **История** (`history`) | `textarea` | да | нет | Диалог и результат последнего инструмента |
| **Observations** (`observations`) | `textarea` | да | нет | Observations |
| **Rules** (`rules`) | `textarea` | static | нет | JSON [{id,body}] или текст |
| **Skills** (`skills`) | `textarea` | static | нет | JSON [{id,body}] или текст |
| **Tools** (`tools`) | `textarea` | да | нет | Карточки с роутера провайдеров |
| **Инструкции оператора** (`systemPrompt`) | `textarea` | static | нет | Добавляются к собранному промпту. Контракт JSON задаёт код. |
| **Стратегия** (`strategy`) | `string` | да | нет | Вход с узла RAG: стратегия |
| **Max actions per turn** (`maxActions`) | `number` | static | нет | Max actions per turn |
| **Query tool** (`queryTool`) | `string` | static | нет | Id инструмента, которым retrieval отвечает без планировщика |
| **Mode** (`mode`) | `string` | да | нет | direct | retrieval | analysis | research. Берётся из task, если порт пуст. |
| **Enabled** (`enabled`) | `boolean` | да | нет | Ветка switch. Пока значение не записано, узел не стартует. |
| **LLM model** (`llmModel`) | `string` | static | нет | LLM model |
| **LLM base URL** (`llmBaseUrl`) | `string` | static | нет | LLM base URL |
| **Temperature** (`temperature`) | `number` | static | нет | Temperature |
| **Max tokens** (`maxTokens`) | `number` | static | нет | Max tokens |
| **API ключ LLM** (`apiKey`) | `ref` | static | нет | API ключ LLM |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **op** (`op`) | `string` | Одна операция этой итерации. Схема сама вызывает узел с тем же id. |
| **args** (`args`) | `textarea` | args |
| **Действия** (`actions`) | `textarea` | Очередь операций, которые схема выполнит на следующих итерациях |
| **Запрос** (`query`) | `string` | Запрос |
| **Черновик ответа** (`answer`) | `textarea` | Черновик ответа |
| **Цитаты** (`citations`) | `textarea` | Цитаты |
| **Наблюдения** (`observations`) | `textarea` | Наблюдения |
| **Метрики хода** (`metrics`) | `textarea` | Метрики хода |
| **История** (`history`) | `textarea` | История |

## Ошибки

Неизвестный `op` или пустой список tools для выбранной операции.
