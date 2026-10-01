# RAG: агрегировать

count, sum, min, max по числовому value evidence. Считает код.

## Зачем

Числовые сводки по evidence считает код, не модель.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Action** (`action`) | `string` | да | нет | Action |
| **Evidence** (`evidence`) | `textarea` | да | нет | Evidence |
| **Args** (`args`) | `textarea` | да | нет | Args |
| **Observations** (`observations`) | `textarea` | да | нет | Observations |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Evidence** (`evidence`) | `textarea` | Evidence |
