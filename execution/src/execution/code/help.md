# Код

Выполняет фрагмент кода и возвращает значение.

JavaScript работает в песочнице процесса: нет доступа к файлам, сети и `process`. Тело с `return` или выражение. `input` — объект с порта. `console.log` попадает в **stdout**.

Python и shell запускаются одноразовым контейнером без сети, с лимитом памяти и удалением после выхода. В контейнере доступна переменная `EXEC_INPUT` (JSON). В Python перед скриптом уже есть `input`.

## Входы

| Поле | Роль |
| --- | --- |
| **language** | static: `javascript` (по умолчанию), `python`, `shell` |
| **source** | static или порт, текст программы |
| **input** | порт, JSON |
| **timeoutMs** | static, миллисекунды, от 100 до 30000 |

## Выходы

- **value** — результат JavaScript, либо последняя строка stdout python/shell, если она является JSON
- **stdout**, **stderr**, **exitCode**

Пример JavaScript: `return input.a + input.b`.
