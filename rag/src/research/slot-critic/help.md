# RAG: критик полей

Модель решает, называет ли фрагмент значение своего поля. Отказ снимает claim и оставляет поле открытым. Продолжение цикла не решает.

## Зачем

Модель подтверждает смысл фрагмента для поля; отказ оставляет поле открытым.

## Поведение

Critic получает предложения по коротким id (`p1`, …). Отказ помечает proposal `rejected` и снимает claim; поле остаётся открытым для следующего хода. Critic не решает, продолжать ли цикл.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Вопрос** (`message`) | `textarea` | да | да | Вопрос |
| **Observations** (`observations`) | `textarea` | да | нет | Observations |
| **API ключ LLM** (`apiKey`) | `ref` | static | нет | API ключ LLM |
| **LLM model** (`llmModel`) | `string` | static | нет | LLM model |
| **LLM base URL** (`llmBaseUrl`) | `string` | static | нет | LLM base URL |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Claims** (`claims`) | `textarea` | Claims |
| **Observations** (`observations`) | `textarea` | Observations |

## Ошибки

При ошибке LLM вердикты не применяются (`critic:unavailable`); claims без отказа сохраняются.
