# RAG: вывести текущее значение

Вход: subject, predicate. Выход: DerivedValue. Параметр asOf. Несколько accepted на дату → пустое value и alternatives.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Субъект** (`subject`) | `string` | да | да | Subject |
| **Предикат** (`predicate`) | `string` | да | да | Predicate |
| **Claims** (`claims`) | `textarea` | да | да | Окно Claim S2 |
| **На дату** (`asOf`) | `string` | да | да | ISO asOf |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **DerivedValue** (`derived`) | `textarea` | DerivedValue |
