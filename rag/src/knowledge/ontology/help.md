# RAG: эволюция онтологии

Вход: решение ADD | ALIAS | MERGE | RETIRE | SUBTYPE и ссылка на evidence. Выход: запись журнала и номер среза схемы.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Решение** (`decision`) | `textarea` | да | да | OntologyEvolveDecision |
| **Evidence ID** (`evidenceId`) | `string` | да | нет | Ссылка на evidence |
| **Текущая версия** (`currentSchemaVersion`) | `number` | да | да | Текущий номер схемы |
| **Утверждено** (`assertedAt`) | `string` | да | нет | ISO assertedAt |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Запись журнала** (`entry`) | `textarea` | OntologyEvolveLogEntry |
| **Версия схемы** (`schemaVersion`) | `number` | Новый номер среза |
