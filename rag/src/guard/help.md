# RAG: гард цикла

Закрывает цикл по полному вердикту, по сданным полям retrieval, по конфликту, по skipRetrieval или по лимиту ходов. Ответ не меняет.

## Зачем

Только гард решает, продолжать цикл или отдать ответ.

## Поведение

Решает только одно: продолжать ли цикл. Ответ проходит насквозь без правок.

`breakLoop = true`, когда:

- вердикт судьи `consistent && sufficient && complete`;
- режим `retrieval` и вердикт `complete` (каждое поле заполнено или сдано ходом);
- вердикт `consistent = false` — конфликт значений терминален;
- рамка вопроса `skipRetrieval`;
- внешний `turnLimited` или число ходов достигло `maxTurns`.

Пока у `retrieval` есть незакрытое поле, `continueLoop = true`. Порт `reason` называет причину.

## Параметры

| Поле | Тип | Порт | Обязательно | Описание |
| --- | --- | --- | --- | --- |
| **Ответ** (`answer`) | `textarea` | да | нет | Черновик хода; проходит насквозь |
| **Observations** (`observations`) | `textarea` | да | нет | С вердиктом судьи и рамкой вопроса |
| **Лимит ходов** (`turnLimited`) | `boolean` | да | нет | Внешний сигнал; дополняет maxTurns |
| **Max turns** (`maxTurns`) | `number` | static | нет | Max turns |

## Выходы

| Поле | Тип | Описание |
| --- | --- | --- |
| **Ответ** (`answer`) | `textarea` | Ответ |
| **breakLoop** (`breakLoop`) | `boolean` | breakLoop |
| **continueLoop** (`continueLoop`) | `boolean` | Для system.output в теле system.loop |
| **reason** (`reason`) | `string` | verdict | conflict | skip_retrieval | turn_limit | open_gaps | no_verdict |
| **Observations** (`observations`) | `textarea` | Observations |
| **Метрики** (`metrics`) | `textarea` | Терны, токены, тулы, вектор и граф текущего прогона |
