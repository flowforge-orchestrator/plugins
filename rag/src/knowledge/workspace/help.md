# RAG: собрать workspace

Вход: вопрос и результаты чтения. Выход: Workspace. Бюджет — поля контракта; обрезка пишет «что отброшено».

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Вопрос** (`question`) | `textarea` | да | да | Вопрос |
| **Сущности** (`entities`) | `textarea` | да | нет | Entity[] |
| **Понятия** (`concepts`) | `textarea` | да | нет | Concept[] |
| **Claims** (`claims`) | `textarea` | да | нет | Claim[] |
| **Evidence** (`evidence`) | `textarea` | да | нет | Evidence[] |
| **Гипотезы** (`hypotheses`) | `textarea` | да | нет | WorkspaceHypothesis[] |
| **Окно** (`timeWindow`) | `textarea` | да | нет | `{ from, to }` |
| **Бюджет** (`budget`) | `textarea` | static | нет | Лимиты сущностей/claims/evidence/понятий |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Workspace** (`workspace`) | `textarea` | Workspace |
