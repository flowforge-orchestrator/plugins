# RAG: объединить evidence

Складывает evidence адаптеров в одно хранилище. Одинаковый id не дублируется.

## Зачем

Несколько адаптеров evidence сходятся в одно хранилище observations.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Observations** (`observations`) | `textarea` | да | нет | Observations |
| **Enabled** (`enabled`) | `boolean` | да | нет | Ветка switch. Пока значение не записано, узел не стартует. |
| **a** (`a`) | `textarea` | да | нет | a |
| **b** (`b`) | `textarea` | да | нет | b |
| **c** (`c`) | `textarea` | да | нет | c |
| **d** (`d`) | `textarea` | да | нет | d |
| **e** (`e`) | `textarea` | да | нет | e |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Evidence** (`evidence`) | `textarea` | Evidence |
| **Observations** (`observations`) | `textarea` | Observations |
