# @conveyor/plugin-office

Плагин читает и записывает **офисные форматы** (CSV, XLSX, DOCX) в workspace процесса.

## Назначение

Узлы для ETL и документооборота в графе: табличные данные как массив объектов, извлечение текста из DOCX, запись XLSX с опциональным base64 на выходе (для email или storage). Пути к файлам — относительно базовой директории workspace runtime.

## Узлы

| nodeType | Название | Описание |
| --- | --- | --- |
| `system.office.csv.read` | Office: csv read | CSV → массив объектов |
| `system.office.csv.write` | Office: csv write | Массив объектов → CSV |
| `system.office.xlsx.read` | Office: xlsx read | Лист XLSX → строки |
| `system.office.xlsx.write` | Office: xlsx write | Строки → XLSX (файл и/или base64) |
| `system.office.docx.extractText` | Office: docx extract text | Текст из DOCX |

Справка — `help.md` рядом с каждым executor'ом в `src/*/`.

## Конфигурация в редакторе

- Включите плагин **Офис** в workspace.
- Пути, кодировки, разделители, имя листа — static или порты узла.
- Секретов нет; доступ к файлам ограничен workspace runtime.

## Для разработчика

**Пакет:** `@conveyor/plugin-office` · **pluginId:** `office`

**Структура:**

```
office/
  src/
    office-manifest.builder.ts
    office-batch.source.ts
    csv-read/ csv-write/ xlsx-read/ xlsx-write/ docx-extract-text/
```

**Сборка:**

```bash
npm run build -w @conveyor/plugin-office
```

**Docker:** сервис `office`, порт **9411** ([`docker-compose.yml`](../docker-compose.yml)).

**Зависимости:** `exceljs`, `csv-parse` / `csv-stringify`, `mammoth` (DOCX) — см. `package.json`.

**Связь с email:** выход `xlsx write` (base64) можно подать на `data.email.send` как inline-вложение.
